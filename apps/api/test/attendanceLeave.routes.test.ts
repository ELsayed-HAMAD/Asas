import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { attendanceRoutes } from '../src/modules/hr/attendance.routes.js'

const leaveId = 'clxxxxxxxxxxxxxxxxxxxxxxx'

async function setup() {
  const events: string[] = []
  const ownRequest = {
    id: leaveId, tenantId: 'tenant_1', employeeId: 'cemployee1', type: 'VACATION',
    startDate: new Date('2026-10-10T00:00:00Z'), endDate: new Date('2026-10-11T00:00:00Z'),
    status: 'PENDING', createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-01T00:00:00Z'),
    employee: { name: 'Self User', avatarUrl: null, departmentId: null, department: null },
  }
  const tx = {
    employee: { findFirst: vi.fn().mockResolvedValue({ id: 'cemployee1' }) },
    leavePolicy: { findUnique: vi.fn().mockResolvedValue(null) },
    leaveRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([ownRequest]),
      create: vi.fn().mockResolvedValue(ownRequest),
    },
    auditLog: { create: vi.fn(async () => { events.push('audit') }) },
  }
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_self' } }) } } as unknown as Auth)
  app.decorate('prisma', {
    member: { findUnique: async () => ({ role: 'MEMBER', employeeId: 'cemployee1' }) },
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => {
      const result = await callback(tx)
      events.push('commit')
      return result
    }),
    leaveRequest: { findMany: tx.leaveRequest.findMany },
  } as unknown as PrismaClient)
  const publish = vi.fn(() => { events.push('sse') })
  app.decorate('ssePublish', publish)
  await app.register(attendanceRoutes, { prefix: '/hr' })
  return { app, tx, events, publish }
}

describe('leave self-service routes', () => {
  it('uses the authenticated employee link and commits the request audit before SSE', async () => {
    const { app, tx, events } = await setup()
    try {
      const response = await app.inject({
        method: 'POST', url: '/hr/leave-requests/self',
        payload: { employeeId: 'employee_other', type: 'VACATION', startDate: '2026-10-10', endDate: '2026-10-11' },
      })
      expect(response.statusCode).toBe(201)
      expect(tx.employee.findFirst).toHaveBeenCalledWith({ where: { id: 'cemployee1', tenantId: 'tenant_1', status: 'ACTIVE' }, select: { id: true } })
      expect(tx.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ employeeId: 'cemployee1', tenantId: 'tenant_1', status: 'PENDING' }),
      }))
      expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ actorId: 'user_self', targetType: 'LeaveRequest', targetId: leaveId }),
      }))
      expect(events).toEqual(['audit', 'commit', 'sse'])
    } finally { await app.close() }
  })

  it('restricts the leave-request list to the authenticated employee', async () => {
    const { app, tx } = await setup()
    try {
      const response = await app.inject('/hr/leave-requests')
      expect(response.statusCode).toBe(200)
      expect(tx.leaveRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId: 'tenant_1', employeeId: 'cemployee1' },
      }))
    } finally { await app.close() }
  })
})
