import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { assertEnv, loadEnv } from '../src/config/env.js'
import { exportFileExtension, exportFilePath } from '../src/services/queue.js'
import {
  candidateResumeKey,
  createObjectStorage,
  exportObjectKey,
  LocalObjectStorage,
} from '../src/services/objectStorage.js'

async function main(): Promise<void> {
  const environment = assertEnv(loadEnv())
  if (environment.objectStorageDriver !== 's3') {
    throw new Error('Set OBJECT_STORAGE_DRIVER=s3 and S3_BUCKET before running this migration')
  }
  const apply = process.argv.includes('--apply')
  const storage = createObjectStorage({
    driver: environment.objectStorageDriver,
    bucket: environment.objectStorageBucket,
    region: environment.objectStorageRegion,
    endpoint: environment.objectStorageEndpoint,
    accessKeyId: environment.objectStorageAccessKeyId,
    secretAccessKey: environment.objectStorageSecretAccessKey,
  })
  const local = new LocalObjectStorage(path.join(process.cwd(), 'storage'))
  const prisma = new PrismaClient({ datasources: { db: { url: environment.databaseUrl } } })

  let copiedResumes = 0
  let missingResumes = 0
  let invalidResumes = 0
  let existingResumes = 0
  let copiedExports = 0
  let missingExports = 0
  let existingExports = 0
  try {
    const candidates = await prisma.candidate.findMany({
      where: { resumeUrl: { not: null } },
      select: { id: true, tenantId: true },
    })
    for (const candidate of candidates) {
      const key = candidateResumeKey(candidate.tenantId, candidate.id)
      const existing = await storage.head(key)
      if (existing) {
        const localBytes = await local.get(key)
        if (localBytes && localBytes.length !== existing.size) throw new Error(`Local and cloud resume sizes differ for candidate ${candidate.id}`)
        existingResumes += 1
        continue
      }
      const bytes = await local.get(key)
      if (!bytes) {
        missingResumes += 1
        continue
      }
      if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
        invalidResumes += 1
        continue
      }
      if (apply) {
        await storage.put(key, bytes, 'application/pdf')
        const uploaded = await storage.head(key)
        if (uploaded?.size !== bytes.length) throw new Error(`Could not verify copied resume object for candidate ${candidate.id}`)
      }
      copiedResumes += 1
    }

    const jobs = await prisma.exportJob.findMany({
      where: { status: 'DONE' },
      select: { id: true, tenantId: true, dataScope: true },
    })
    for (const job of jobs) {
      const extension = exportFileExtension(job.dataScope ?? '')
      const key = exportObjectKey(job.tenantId, job.id, extension)
      const existing = await storage.head(key)
      if (existing) {
        try {
          const localBytes = await readFile(exportFilePath(job.id, extension))
          if (localBytes.length !== existing.size) throw new Error(`Local and cloud export sizes differ for job ${job.id}`)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        existingExports += 1
        continue
      }
      let bytes: Buffer
      try {
        bytes = await readFile(exportFilePath(job.id, extension))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          missingExports += 1
          continue
        }
        throw error
      }
      if (apply) {
        await storage.put(key, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        const uploaded = await storage.head(key)
        if (uploaded?.size !== bytes.length) throw new Error(`Could not verify copied export object for job ${job.id}`)
      }
      copiedExports += 1
    }

    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      resumesCopiedOrReady: copiedResumes,
      resumesAlreadyPresent: existingResumes,
      resumesMissingLocally: missingResumes,
      resumesInvalidLocally: invalidResumes,
      exportsCopiedOrReady: copiedExports,
      exportsAlreadyPresent: existingExports,
      exportsMissingLocally: missingExports,
      localFilesPreserved: true,
    }, null, 2))
    if (!apply) console.log('Dry run only. Re-run with --apply to upload the listed objects.')
  } finally {
    await prisma.$disconnect()
    storage.close()
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Storage migration failed')
  process.exitCode = 1
})
