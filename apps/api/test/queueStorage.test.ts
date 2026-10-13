import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExportQueue } from '../src/services/queue.js'
import { exportObjectKey, LocalObjectStorage } from '../src/services/objectStorage.js'

const root = `queue-storage-test-${process.pid}`
const storage = new LocalObjectStorage(root)

afterEach(async () => {
  await storage.delete(exportObjectKey('tenant1', 'job1', 'xlsx'))
})

describe('export object storage', () => {
  it('stores completed export bytes under the tenant-scoped object key', async () => {
    const updates: Record<string, unknown>[] = []
    const queue = await createExportQueue({
      storage,
      store: {
        create: async () => ({ id: 'job1' }),
        updateMany: async ({ data }) => { updates.push(data) },
        getTenantId: async jobId => jobId === 'job1' ? 'tenant1' : null,
      },
    })
    queue.register('employees', async () => Buffer.from('xlsx-data'))

    await expect(queue.submit('employees', { canReadSalary: false }, 'tenant1')).resolves.toBe('job1')
    expect(await storage.get(exportObjectKey('tenant1', 'job1', 'xlsx'))).toEqual(Buffer.from('xlsx-data'))
    expect(updates).toEqual([{ status: 'RUNNING', progressPct: 10 }, { status: 'DONE', progressPct: 100 }])
  })

  it('does not store an export when its owning tenant cannot be resolved', async () => {
    const queue = await createExportQueue({
      storage,
      store: {
        create: async () => ({ id: 'job1' }),
        updateMany: vi.fn(async () => undefined),
        getTenantId: async () => null,
      },
    })
    queue.register('employees', async () => Buffer.from('must-not-store'))
    await expect(queue.submit('employees', {}, 'tenant1')).rejects.toThrow('Export job job1 not found')
    expect(await storage.get(exportObjectKey('tenant1', 'job1', 'xlsx'))).toBeNull()
  })
})
