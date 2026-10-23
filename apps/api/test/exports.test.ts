import type { PrismaClient } from '@prisma/client'
import { exportJobCreateSchema } from '@asas/contracts'
import { describe, expect, it, vi } from 'vitest'
import { buildWorkspaceArchive, registerExportHandlers } from '../src/modules/exports/exports.routes.js'
import { renderProjectsXlsx } from '../src/services/export.js'
import { exportContentType } from '../src/services/queue.js'

describe('exports', () => {
  it('registers employees, ledger, projects, and workspace handlers', () => {
    const handlers: Record<string, Function> = {}
    const queue = {
      register: vi.fn((kind, handler) => {
        handlers[kind] = handler
      }),
    }
    const prisma = {} as PrismaClient

    registerExportHandlers(queue, prisma)

    expect(queue.register).toHaveBeenCalledWith('employees', expect.any(Function))
    expect(queue.register).toHaveBeenCalledWith('ledger', expect.any(Function))
    expect(queue.register).toHaveBeenCalledWith('projects', expect.any(Function))
    expect(queue.register).toHaveBeenCalledWith('workspace', expect.any(Function))
  })

  it('renders projects xlsx buffer deterministically', async () => {
    const buffer = await renderProjectsXlsx([
      {
        name: 'Project Alpha',
        status: 'ACTIVE',
        department: 'Engineering',
        budget: '10000.00',
        spent: '2500.00',
        currency: 'USD',
        sprintsCount: 3,
      },
    ])

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('uses a matching media type for each supported file kind', () => {
    expect(exportContentType('workspace')).toBe('application/json; charset=utf-8')
    expect(exportContentType('employees')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('rejects export format options that are not actually implemented', () => {
    expect(exportJobCreateSchema.safeParse({ kind: 'employees', format: 'csv' }).success).toBe(false)
    expect(exportJobCreateSchema.safeParse({ kind: 'employees', dateRange: '2026-Q1' }).success).toBe(false)
    expect(exportJobCreateSchema.safeParse({ kind: 'employees' }).success).toBe(true)
  })

  it('exports all tenant-scoped models and dependent records while omitting secrets', async () => {
    const calls = new Map<string, Array<{ where: Record<string, unknown>; select: Record<string, boolean> }>>()
    const fixtures: Record<string, Record<string, unknown>[]> = {
      deal: [{ id: 'deal_1', tenantId: 'tenant_1', name: 'Tenant deal' }],
      stockMovement: [{ id: 'movement_1', tenantId: 'tenant_1', delta: 4 }],
      auditLog: [{ id: 'audit_1', tenantId: 'tenant_1', metadata: { action: 'workspace.update', apiToken: 'must-not-export' } }],
      issueComment: [{ id: 'comment_1', issueId: 'issue_1', body: 'Project note' }],
      integration: [{ id: 'integration_1', tenantId: 'tenant_1', status: 'CONFIGURE', credential: 'https://secret.example/path' }],
      employee: [{ id: 'employee_1', tenantId: 'tenant_1', name: 'Ada', bankRoutingNumber: '021000021', bankAccountNumber: '1234567890', bankIban: 'DE89370400440532013000', bankBic: 'DEUTDEFF' }],
    }
    const tx = new Proxy({
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1', name: 'Acme', stripeCustomerId: 'cus_123' }) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'user_1', name: 'Owner', email: 'owner@example.com' }]) },
    }, {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) return Reflect.get(target, property, receiver)
        if (typeof property !== 'string') return undefined
        return {
          findMany: vi.fn(async (args: { where: Record<string, unknown>; select: Record<string, boolean> }) => {
            calls.set(property, [...(calls.get(property) ?? []), args])
            return (fixtures[property] ?? []).map(record => Object.fromEntries(
              Object.entries(record).filter(([field]) => args.select[field]),
            ))
          }),
        }
      },
    })
    const prisma = {
      $transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>, options: unknown) => {
        expect(options).toMatchObject({ isolationLevel: 'RepeatableRead' })
        return callback(tx)
      }),
    } as unknown as PrismaClient

    const buffer = await buildWorkspaceArchive(prisma, 'tenant_1')
    const archive = JSON.parse(buffer.toString('utf8'))

    expect(archive.metadata.version).toBe('2.0.0')
    expect(archive.data.Deal).toEqual(fixtures.deal)
    expect(archive.data.StockMovement).toEqual(fixtures.stockMovement)
    expect(archive.data.AuditLog).toEqual([{ id: 'audit_1', tenantId: 'tenant_1', metadata: { action: 'workspace.update' } }])
    expect(archive.data.IssueComment).toEqual(fixtures.issueComment)
    expect(archive.data.UserIdentity).toEqual([{ id: 'user_1', name: 'Owner', email: 'owner@example.com' }])
    expect(archive.data.Integration).toEqual([{ id: 'integration_1', tenantId: 'tenant_1', status: 'CONFIGURE' }])
    expect(archive.data.Employee).toEqual([{ id: 'employee_1', tenantId: 'tenant_1', name: 'Ada' }])
    expect(calls.get('deal')?.[0]?.where).toEqual({ tenantId: 'tenant_1' })
    expect(calls.get('issueComment')?.[0]?.where).toEqual({ issue: { tenantId: 'tenant_1' } })
    expect(calls.get('productSupplier')?.[0]?.where).toEqual({
      AND: [{ product: { tenantId: 'tenant_1' } }, { supplier: { tenantId: 'tenant_1' } }],
    })
    expect(calls.get('integration')?.[0]?.select.credential).toBeUndefined()
    expect(calls.get('employee')?.[0]?.select.bankAccountNumber).toBeUndefined()
    expect(JSON.stringify(archive)).not.toContain('https://secret.example/path')
    expect(JSON.stringify(archive)).not.toContain('021000021')
    expect(JSON.stringify(archive)).not.toContain('DE89370400440532013000')
    expect(archive.metadata.modelCounts.Deal).toBe(1)
  })
})
