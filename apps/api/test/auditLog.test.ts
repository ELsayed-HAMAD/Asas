import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { recordAuditLog } from '../src/services/auditLog.js'

describe('recordAuditLog', () => {
  it('writes one row with the action, actor, and tenant', async () => {
    const calls: unknown[] = []
    const prisma = { auditLog: { create: async (args: unknown) => calls.push(args) } } as unknown as Pick<
      PrismaClient,
      'auditLog'
    >

    await recordAuditLog(prisma, {
      tenantId: 'tenant_1',
      actorId: 'user_1',
      action: 'payroll.approve',
      targetType: 'PayrollRun',
      targetId: 'run_1',
    })

    expect(calls).toEqual([
      {
        data: {
          tenantId: 'tenant_1',
          actorId: 'user_1',
          action: 'payroll.approve',
          targetType: 'PayrollRun',
          targetId: 'run_1',
          metadata: null,
        },
      },
    ])
  })

  it('serializes metadata to a JSON string and omits absent target fields', async () => {
    const calls: unknown[] = []
    const prisma = { auditLog: { create: async (args: unknown) => calls.push(args) } } as unknown as Pick<
      PrismaClient,
      'auditLog'
    >

    await recordAuditLog(prisma, {
      tenantId: 'tenant_1',
      actorId: 'user_1',
      action: 'organization.delete',
      metadata: { reason: 'customer requested deletion' },
    })

    expect(calls).toEqual([
      {
        data: {
          tenantId: 'tenant_1',
          actorId: 'user_1',
          action: 'organization.delete',
          metadata: '{"reason":"customer requested deletion"}',
        },
      },
    ])
  })
})
