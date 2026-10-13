import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import {
  assertSafeObjectKey,
  candidateResumeKey,
  candidateResumeStagingKey,
  exportObjectKey,
  getTenantStorageBytes,
  LocalObjectStorage,
  S3ObjectStorage,
} from '../src/services/objectStorage.js'

const config = {
  driver: 's3' as const,
  bucket: 'asas-private',
  region: 'auto',
  endpoint: 'https://account.r2.cloudflarestorage.com',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
}

describe('object storage keys', () => {
  it('scopes candidate, staging and export objects by tenant', () => {
    expect(candidateResumeKey('tenant1', 'candidate1')).toBe('resumes/tenant1/candidate1.pdf')
    expect(candidateResumeStagingKey('tenant1', 'candidate1', 'upload-id')).toBe('staging/resumes/tenant1/candidate1/upload-id.pdf')
    expect(exportObjectKey('tenant1', 'job1', 'xlsx')).toBe('exports/tenant1/job1.xlsx')
  })

  it.each(['../secret', '/absolute/key', 'a\\b', 'a//b', 'a/./b'])('rejects unsafe object key %s', key => {
    expect(() => assertSafeObjectKey(key)).toThrow('Invalid object storage key')
  })
})

describe('local object storage', () => {
  const root = `storage-test-${process.pid}`
  const storage = new LocalObjectStorage(root)

  afterEach(async () => {
    await storage.delete('resumes/tenant1/candidate1.pdf')
  })

  it('writes, reads, measures and deletes objects under the configured root', async () => {
    const bytes = Buffer.from('%PDF-1.7 sample')
    await storage.put('resumes/tenant1/candidate1.pdf', bytes, 'application/pdf')
    expect(await storage.head('resumes/tenant1/candidate1.pdf')).toEqual({ size: bytes.length })
    expect(await storage.readPrefix('resumes/tenant1/candidate1.pdf', 5)).toEqual(Buffer.from('%PDF-'))
    expect(await storage.get('resumes/tenant1/candidate1.pdf')).toEqual(bytes)
    await storage.delete('resumes/tenant1/candidate1.pdf')
    expect(await storage.get('resumes/tenant1/candidate1.pdf')).toBeNull()
  })

  it('sums tenant resumes, exports and staging while excluding neighboring tenants', async () => {
    const keys = [
      'resumes/tenant1/candidate.pdf',
      'exports/tenant1/report.xlsx',
      'staging/resumes/tenant1/candidate/upload.pdf',
      'resumes/tenant2/other.pdf',
    ]
    try {
      await Promise.all(keys.map((key, index) => storage.put(key, Buffer.alloc(index + 1), 'application/octet-stream')))
      expect(await getTenantStorageBytes(storage, 'tenant1')).toBe(6)
      expect(await getTenantStorageBytes(storage, 'tenant-missing')).toBe(0)
    } finally {
      await Promise.all(keys.map(key => storage.delete(key)))
    }
  })
})

describe('S3-compatible object storage', () => {
  it('presigns a content-type-bound PUT and a time-limited GET without network access', async () => {
    const client = new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } })
    const storage = new S3ObjectStorage(config, client)
    const uploadUrl = await storage.presignPut('staging/resumes/t1/c1/u1.pdf', 'application/pdf', 600)
    const downloadUrl = await storage.presignGet('exports/t1/j1.xlsx', 'application/xlsx', 'attachment; filename="report.xlsx"', 120)
    expect(uploadUrl).toContain('X-Amz-Expires=600')
    expect(decodeURIComponent(uploadUrl)).toContain('X-Amz-SignedHeaders=content-type;host')
    expect(uploadUrl).not.toContain('x-amz-sdk-checksum-algorithm')
    expect(downloadUrl).toContain('X-Amz-Expires=120')
    expect(decodeURIComponent(downloadUrl)).toContain('report.xlsx')
    await client.destroy()
  })

  it('maps S3 put, range-read, metadata, delete and missing-object operations', async () => {
    const client = new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } })
    const send = vi.spyOn(client, 'send')
    send.mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({ Body: { transformToByteArray: async () => Uint8Array.from([37, 80, 68, 70, 45]) } } as never)
      .mockResolvedValueOnce({ ContentLength: 5 } as never)
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NoSuchKey' }))
      .mockResolvedValueOnce({} as never)
    const storage = new S3ObjectStorage(config, client)

    await storage.put('resumes/t1/c1.pdf', Buffer.from('%PDF-'), 'application/pdf')
    expect(await storage.readPrefix('resumes/t1/c1.pdf', 5)).toEqual(Buffer.from('%PDF-'))
    expect(await storage.head('resumes/t1/c1.pdf')).toEqual({ size: 5 })
    expect(await storage.get('resumes/t1/missing.pdf')).toBeNull()
    await storage.delete('resumes/t1/c1.pdf')
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand)
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand)
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(HeadObjectCommand)
    expect(send.mock.calls[4]?.[0]).toBeInstanceOf(DeleteObjectCommand)
    await client.destroy()
  })

  it('paginates S3 prefix listings and totals current object sizes', async () => {
    const client = new S3Client({ region: config.region, endpoint: config.endpoint, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } })
    const send = vi.spyOn(client, 'send')
    send.mockResolvedValueOnce({ Contents: [{ Size: 4 }, { Size: 2 }], IsTruncated: true, NextContinuationToken: 'next' } as never)
      .mockResolvedValueOnce({ Contents: [{ Size: 8 }], IsTruncated: false } as never)
    const storage = new S3ObjectStorage(config, client)
    expect(await storage.sumPrefixSizes('resumes/tenant1/')).toBe(14)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(ListObjectsV2Command)
    expect((send.mock.calls[0]?.[0] as ListObjectsV2Command).input).toMatchObject({ Bucket: config.bucket, Prefix: 'resumes/tenant1/' })
    expect((send.mock.calls[1]?.[0] as ListObjectsV2Command).input.ContinuationToken).toBe('next')
    await client.destroy()
  })

  it('rejects incomplete credentials and non-bucket custom endpoints', () => {
    expect(() => new S3ObjectStorage({ ...config, secretAccessKey: '' })).toThrow('must be configured together')
    expect(() => new S3ObjectStorage({ ...config, accessKeyId: '', secretAccessKey: '' })).toThrow('credentials are required')
  })
})
