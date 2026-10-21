import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface StoredObjectMetadata {
  size: number
}

export interface ObjectStorage {
  readonly mode: 'local' | 's3'
  put(key: string, bytes: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer | null>
  readPrefix(key: string, byteCount: number): Promise<Buffer | null>
  head(key: string): Promise<StoredObjectMetadata | null>
  sumPrefixSizes(prefix: string): Promise<number>
  copy(sourceKey: string, destinationKey: string, contentType: string): Promise<void>
  delete(key: string): Promise<void>
  presignPut(key: string, contentType: string, expiresIn: number, maxBytes?: number): Promise<string>
  presignGet(key: string, contentType: string, disposition: string, expiresIn: number): Promise<string>
  close(): void
}

declare module 'fastify' {
  interface FastifyInstance {
    objectStorage: ObjectStorage
  }
}

export interface ObjectStorageConfig {
  driver: 'local' | 's3'
  bucket: string
  region: string
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  localDirectory?: string
}

export function assertSafeObjectKey(key: string): string {
  const parts = key.split('/')
  if (!key || key.startsWith('/') || key.includes('\\') || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error('Invalid object storage key')
  }
  return key
}

export function candidateResumeKey(tenantId: string, candidateId: string): string {
  return assertSafeObjectKey(`resumes/${tenantId}/${candidateId}.pdf`)
}

export function candidateResumeStagingKey(tenantId: string, candidateId: string, uploadId: string): string {
  return assertSafeObjectKey(`staging/resumes/${tenantId}/${candidateId}/${uploadId}.pdf`)
}

export function exportObjectKey(tenantId: string, jobId: string, extension: string): string {
  return assertSafeObjectKey(`exports/${tenantId}/${jobId}.${extension}`)
}

export function tenantStoragePrefixes(tenantId: string): string[] {
  const tenantSegment = assertSafeObjectKey(`tenants/${tenantId}/scope`).split('/')[1]!
  return [
    `resumes/${tenantSegment}/`,
    `exports/${tenantSegment}/`,
    `staging/resumes/${tenantSegment}/`,
  ]
}

export async function getTenantStorageBytes(storage: ObjectStorage, tenantId: string): Promise<number> {
  const sizes = await Promise.all(tenantStoragePrefixes(tenantId).map(prefix => storage.sumPrefixSizes(prefix)))
  const total = sizes.reduce((sum, size) => sum + size, 0)
  if (!Number.isSafeInteger(total)) throw new Error('Tenant storage size exceeds the supported range')
  return total
}

export class LocalObjectStorage implements ObjectStorage {
  readonly mode = 'local' as const
  private readonly root: string

  constructor(root = path.join(process.cwd(), 'storage')) {
    this.root = path.resolve(root)
  }

  private filePath(key: string): string {
    const safeKey = assertSafeObjectKey(key)
    const file = path.resolve(this.root, ...safeKey.split('/'))
    if (!file.startsWith(`${this.root}${path.sep}`)) throw new Error('Object storage key escapes the configured root')
    return file
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const file = this.filePath(key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, bytes)
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.filePath(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async readPrefix(key: string, byteCount: number): Promise<Buffer | null> {
    const bytes = await this.get(key)
    return bytes?.subarray(0, byteCount) ?? null
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    try {
      return { size: (await stat(this.filePath(key))).size }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async sumPrefixSizes(prefix: string): Promise<number> {
    const safePrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
    const root = this.filePath(safePrefix)
    const visit = async (directory: string): Promise<number> => {
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
        throw error
      }
      const sizes = await Promise.all(entries.map(async entry => {
        const child = path.join(directory, entry.name)
        if (entry.isDirectory()) return visit(child)
        if (entry.isFile()) return (await stat(child)).size
        return 0
      }))
      return sizes.reduce((sum, size) => sum + size, 0)
    }
    return visit(root)
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const bytes = await this.get(sourceKey)
    if (!bytes) throw new Error('Source object not found')
    await this.put(destinationKey, bytes)
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  async presignPut(_key?: string, _contentType?: string, _expiresIn?: number, _maxBytes?: number): Promise<string> {
    throw new Error('Presigned uploads are available only when S3 object storage is configured')
  }

  async presignGet(): Promise<string> {
    throw new Error('Presigned downloads are available only when S3 object storage is configured')
  }

  close(): void {}
}

export class S3ObjectStorage implements ObjectStorage {
  readonly mode = 's3' as const
  private readonly client: S3Client

  constructor(private readonly config: ObjectStorageConfig, client?: S3Client) {
    if (!config.bucket.trim()) throw new Error('S3_BUCKET is required for S3 object storage')
    if (Boolean(config.accessKeyId) !== Boolean(config.secretAccessKey)) {
      throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together')
    }
    if (config.endpoint && !config.accessKeyId) {
      throw new Error('S3 credentials are required when using a custom S3_ENDPOINT')
    }
    this.client = client ?? new S3Client({
      region: config.region || 'us-east-1',
      // R2's S3 API does not accept the SDK's optional x-amz-sdk-checksum-algorithm parameter.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      ...(config.endpoint && { endpoint: config.endpoint, forcePathStyle: true }),
      ...(config.accessKeyId && config.secretAccessKey && {
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      }),
    })
  }

  private key(key: string): string {
    return assertSafeObjectKey(key)
  }

  private isMissing(error: unknown): boolean {
    const value = error as { name?: string; $metadata?: { httpStatusCode?: number } }
    return value?.name === 'NotFound' || value?.name === 'NoSuchKey' || value?.$metadata?.httpStatusCode === 404
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: this.key(key),
      Body: bytes,
      ContentType: contentType,
    }))
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(key) }))
      if (!result.Body) return null
      return Buffer.from(await result.Body.transformToByteArray())
    } catch (error) {
      if (this.isMissing(error)) return null
      throw error
    }
  }

  async readPrefix(key: string, byteCount: number): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(key),
        Range: `bytes=0-${Math.max(0, byteCount - 1)}`,
      }))
      if (!result.Body) return null
      return Buffer.from(await result.Body.transformToByteArray())
    } catch (error) {
      if (this.isMissing(error)) return null
      throw error
    }
  }

  async head(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.key(key) }))
      return typeof result.ContentLength === 'number' ? { size: result.ContentLength } : null
    } catch (error) {
      if (this.isMissing(error)) return null
      throw error
    }
  }

  async sumPrefixSizes(prefix: string): Promise<number> {
    const safePrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
    let continuationToken: string | undefined
    let total = 0
    do {
      const result = await this.client.send(new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: `${this.key(safePrefix)}/`,
        ContinuationToken: continuationToken,
      }))
      total += (result.Contents ?? []).reduce((sum, object) => sum + (object.Size ?? 0), 0)
      if (!Number.isSafeInteger(total)) throw new Error('Tenant storage size exceeds the supported range')
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined
    } while (continuationToken)
    return total
  }

  async copy(sourceKey: string, destinationKey: string, contentType: string): Promise<void> {
    const source = this.key(sourceKey).split('/').map(encodeURIComponent).join('/')
    await this.client.send(new CopyObjectCommand({
      Bucket: this.config.bucket,
      Key: this.key(destinationKey),
      CopySource: `${this.config.bucket}/${source}`,
      ContentType: contentType,
      MetadataDirective: 'REPLACE',
    }))
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.key(key) }))
  }

  async presignPut(key: string, contentType: string, expiresIn: number, maxBytes?: number): Promise<string> {
    const headers = new Set(['content-type'])
    if (maxBytes !== undefined) {
      headers.add('content-length')
    }
    return getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: this.key(key),
      ContentType: contentType,
      ...(maxBytes !== undefined && { ContentLength: maxBytes }),
    }), { expiresIn, signableHeaders: headers })
  }

  async presignGet(key: string, contentType: string, disposition: string, expiresIn: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: this.key(key),
      ResponseContentType: contentType,
      ResponseContentDisposition: disposition,
    }), { expiresIn })
  }

  close(): void {
    this.client.destroy()
  }
}

export function createObjectStorage(config: ObjectStorageConfig): ObjectStorage {
  return config.driver === 's3' ? new S3ObjectStorage(config) : new LocalObjectStorage(config.localDirectory)
}
