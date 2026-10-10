import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { attendanceRoutes } from '../src/modules/hr/attendance.routes.js'

const sheetId = 'clxxxxxxxxxxxxxxxxxxxxxxx'
const exceptionId = 'clxxxxxxxxxxxxxxxxxxxxxxx'

async function setup() {
  const events: string[] = []
  const publish = vi.fn(() => { events.push('sse') })
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } }) } } as unknown as Auth)
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'sheet_1' }]),
    timesheet: {
      findMany: vi.fn().mockResolvedValue([{
        id: sheetId, employeeId: 'employee_1', weekStart: new Date('2026-10-05T00:00:00Z'), approvedAt: null,
        days: [{ clockIn: '09:00', clockOut: '17:00', totalHours: 8 }],
      }]),
      updateMany: vi.fn(async () => { events.push('write'); return { count: 1 } }),
      update: vi.fn().mockResolvedValue({}),
    },
    timesheetDay: {
      findFirst: vi.fn().mockResolvedValue({
        id: sheetId, date: new Date('2026-10-06T00:00:00Z'), dayLabel: '2026-10-06',
        clockIn: '09:00', clockOut: '17:00', clockInAt: new Date('2026-10-06T09:00:00Z'),
        clockOutAt: new Date('2026-10-06T17:00:00Z'), totalHours: 8, timesheetId: 'sheet_1',
        timesheet: { id: 'sheet_1', employeeId: 'employee_1', approvedAt: null },
      }),
      update: vi.fn(async ({ data }: { data: { totalHours: number | null } }) => {
        events.push('write')
        return { id: sheetId, totalHours: data.totalHours }
      }),
      findMany: vi.fn().mockResolvedValue([{ totalHours: 9.5 }, { totalHours: 8 }]),
    },
    tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
    attendanceException: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockImplementation(({ where }: { where: { type?: string } }) => where.type === 'OVERTIME'
        ? Promise.resolve(null)
        : Promise.resolve({
          id: exceptionId, tenantId: 'tenant_1', employeeId: sheetId, type: 'MISSING_OUT', label: 'Missing clock-out',
          date: new Date('2026-10-06T00:00:00Z'), alert: true, createdAt: new Date('2026-10-06T17:00:00Z'),
          employee: { name: 'Ada', avatarUrl: null, departmentId: null, department: null },
        })),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn(async () => { events.push('write'); return { count: 1 } }),
    },
    auditLog: { create: vi.fn(async () => { events.push('audit'); return {} }) },
  }
  app.decorate('prisma', {
    member: { findUnique: async () => ({ role: 'ADMIN', employeeId: null }) },
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => {
      const result = await callback(tx)
      events.push('commit')
      return result
    }),
  } as unknown as PrismaClient)
  app.decorate('ssePublish', publish)
  await app.register(attendanceRoutes, { prefix: '/hr' })
  return { app, tx, events, publish }
}

describe('timesheet approval route', () => {
  it('validates eligibility and commits its audit before publishing SSE', async () => {
    const { app, tx, events } = await setup()
    try {
      const response = await app.inject({ method: 'POST', url: `/hr/attendance/timesheets/${sheetId}/approve` })
      expect(response.statusCode, response.body).toBe(200)
      expect(tx.timesheet.findMany).toHaveBeenCalled()
      expect(tx.timesheet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: [sheetId] }, tenantId: 'tenant_1', approvedAt: null },
      }))
      expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant_1', actorId: 'admin_1', targetId: sheetId }),
      }))
      expect(events).toEqual(['write', 'audit', 'commit', 'sse'])
    } finally { await app.close() }
  })

  it('does not commit or publish an approval when its audit insert fails', async () => {
    const { app, tx, events, publish } = await setup()
    tx.auditLog.create.mockRejectedValueOnce(new Error('audit insert unavailable'))
    try {
      const response = await app.inject({ method: 'POST', url: `/hr/attendance/timesheets/${sheetId}/approve` })
      expect(response.statusCode).toBe(500)
      expect(events).toEqual(['write'])
      expect(publish).not.toHaveBeenCalled()
    } finally { await app.close() }
  })
})

describe('attendance exception resolution route', () => {
  it('resolves an open exception, audits it, commits, then publishes SSE', async () => {
    const { app, tx, events, publish } = await setup()
    try {
      const response = await app.inject({ method: 'POST', url: `/hr/attendance/exceptions/${exceptionId}/resolve` })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data).toMatchObject({ id: exceptionId, alert: false, employeeName: 'Ada' })
      expect(tx.attendanceException.updateMany).toHaveBeenCalledWith({
        where: { id: exceptionId, tenantId: 'tenant_1', alert: true }, data: { alert: false },
      })
      expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'tenant_1', actorId: 'admin_1', action: 'hr.attendance.exception.resolve', targetId: exceptionId }),
      }))
      expect(events).toEqual(['write', 'audit', 'commit', 'sse'])
      expect(publish).toHaveBeenCalledTimes(1)
    } finally { await app.close() }
  })

  it('corrects punches and commits the before/after audit before publishing SSE', async () => {
    const { app, tx, events, publish } = await setup()
    try {
      const response = await app.inject({
        method: 'PATCH', url: `/hr/attendance/timesheet-days/${sheetId}/correct`,
        payload: { clockInDate: '2026-10-06', clockInTime: '09:00', clockOutDate: '2026-10-06', clockOutTime: '18:30' },
      })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().data).toMatchObject({ id: sheetId, clockOutTime: '18:30', totalHours: 9.5 })
      expect(tx.timesheet.update).toHaveBeenCalledWith(expect.objectContaining({ data: { totalHours: 17.5, overtimeHours: 1.5, regularHours: 16 } }))
      const auditCall = tx.auditLog.create.mock.calls.find(([args]) => args.data.action === 'hr.attendance.punch.correct')
      expect(auditCall?.[0].data).toMatchObject({ tenantId: 'tenant_1', actorId: 'admin_1', targetId: sheetId })
      expect(JSON.parse(auditCall?.[0].data.metadata as string)).toMatchObject({
        before: { clockIn: '09:00', clockOut: '17:00', totalHours: 8 },
        after: expect.objectContaining({ clockOutTime: '18:30', totalHours: 9.5 }),
      })
      expect(events).toEqual(['write', 'audit', 'commit', 'sse'])
      expect(publish).toHaveBeenCalledTimes(1)
    } finally { await app.close() }
  })
})
