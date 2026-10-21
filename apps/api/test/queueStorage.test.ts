import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExportQueue } from '../src/services/queue.js'
import { exportObjectKey, LocalObjectStorage } from '../src/services/objectStorage.js'

const root = `queue-storage-test-${process.pid}`
const storage = new LocalObjectStorage(root)

afterEach(async () => {
  await storage.delete(exportObjectKey('tenant1', 'job1', 'xlsx'))
  await storage.delete(exportObjectKey('tenant1', 'job2', 'json'))
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
        withStorageCapacity: async (_tenantId, _additionalBytes, write) => write(),
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
        withStorageCapacity: async (_tenantId, _additionalBytes, write) => write(),
      },
    })
    queue.register('employees', async () => Buffer.from('must-not-store'))
    await expect(queue.submit('employees', {}, 'tenant1')).rejects.toThrow('Export job job1 not found')
    expect(await storage.get(exportObjectKey('tenant1', 'job1', 'xlsx'))).toBeNull()
  })

  it('stores JSON workspace exports with a JSON content type and extension', async () => {
    const put = vi.spyOn(storage, 'put')
    const queue = await createExportQueue({
      storage,
      store: {
        create: async () => ({ id: 'job2' }),
        updateMany: async () => undefined,
        getTenantId: async () => 'tenant1',
        withStorageCapacity: async (_tenantId, _additionalBytes, write) => write(),
      },
    })
    queue.register('workspace', async () => Buffer.from('{"ok":true}'))

    await queue.submit('workspace', {}, 'tenant1')

    expect(await storage.get(exportObjectKey('tenant1', 'job2', 'json'))).toEqual(Buffer.from('{"ok":true}'))
    expect(put).toHaveBeenCalledWith(
      exportObjectKey('tenant1', 'job2', 'json'),
      Buffer.from('{"ok":true}'),
      'application/json; charset=utf-8',
    )
    put.mockRestore()
  })

  it('does not store an export when tenant storage capacity is exceeded', async () => {
    const put = vi.spyOn(storage, 'put')
    const updates: Record<string, unknown>[] = []
    const queue = await createExportQueue({
      storage,
      store: {
        create: async () => ({ id: 'job1' }),
        updateMany: async ({ data }) => { updates.push(data) },
        getTenantId: async () => 'tenant1',
        withStorageCapacity: async () => { throw new Error('Workspace storage quota exceeded') },
      },
    })
    queue.register('employees', async () => Buffer.from('too-large'))

    await expect(queue.submit('employees', {}, 'tenant1')).rejects.toThrow(/storage quota exceeded/i)
    expect(put).not.toHaveBeenCalled()
    expect(updates.at(-1)).toEqual({ status: 'FAILED' })
    put.mockRestore()
  })
})
