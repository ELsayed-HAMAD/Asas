import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import type { Auth } from '../src/auth.js'
import { AUDITED_PERMISSIONS, PERMISSIONS, requirePermission } from '../src/middlewares/permissions.js'

function stubAuth(sessionData: { session: { activeOrganizationId: string | null }; user: { id: string } } | null) {
  return { api: { getSession: async () => sessionData } } as unknown as Auth
}

function stubPrisma(member: { role: 'OWNER' | 'ADMIN' | 'MEMBER'; employeeId: string | null } | null) {
  return { member: { findUnique: async () => member } } as unknown as PrismaClient
}

function stubRequest(auth: Auth, prisma: PrismaClient) {
  const server = { auth, prisma } as unknown as { auth: Auth; prisma: PrismaClient }
  return { server, headers: {} } as unknown as Parameters<ReturnType<typeof requirePermission>>[0]
}

function stubReply() {
  let statusCode = 200
  let body: unknown
  const reply = {
    code(value: number) {
      statusCode = value
      return reply
    },
    send(payload: unknown) {
      body = payload
      return reply
    },
  }
  return { reply: reply as unknown as Parameters<ReturnType<typeof requirePermission>>[1], get statusCode() {
    return statusCode
  }, get body() {
    return body
  } }
}

describe('PERMISSIONS map', () => {
  it('requires ADMIN or higher for payroll approval and salary visibility', () => {
    expect(PERMISSIONS['payroll.approve']).toBe('ADMIN')
    expect(PERMISSIONS['employee.salary.read']).toBe('ADMIN')
  })

  it('enforces separation of duties permissions for finance and HR approvals', () => {
    expect(PERMISSIONS['finance.invoice.approve']).toBe('ADMIN')
    expect(PERMISSIONS['finance.invoice.pay']).toBe('ADMIN')
    expect(PERMISSIONS['finance.invoice.void']).toBe('ADMIN')
    expect(PERMISSIONS['finance.expense.approve']).toBe('ADMIN')
    expect(PERMISSIONS['finance.expense.reimburse']).toBe('ADMIN')
    expect(PERMISSIONS['finance.expense.void']).toBe('ADMIN')
    expect(PERMISSIONS['attendance.read.all']).toBe('ADMIN')
  })

  it('allows MEMBER for self-service capabilities', () => {
    expect(PERMISSIONS['finance.expense.self']).toBe('MEMBER')
    expect(PERMISSIONS['attendance.read.self']).toBe('MEMBER')
    expect(PERMISSIONS['payroll.read.self']).toBe('MEMBER')
  })

  it('reserves organization deletion for OWNER', () => {
    expect(PERMISSIONS['organization.delete']).toBe('OWNER')
  })

  it('marks the attributable actions for the audit log', () => {
    expect(AUDITED_PERMISSIONS.has('payroll.approve')).toBe(true)
    expect(AUDITED_PERMISSIONS.has('finance.invoice.approve')).toBe(true)
    expect(AUDITED_PERMISSIONS.has('finance.invoice.pay')).toBe(true)
    expect(AUDITED_PERMISSIONS.has('finance.invoice.void')).toBe(true)
    expect(AUDITED_PERMISSIONS.has('finance.expense.approve')).toBe(true)
    expect(AUDITED_PERMISSIONS.has('finance.expense.reimburse')).toBe(true)
    expect(AUDITED_PERMISSIONS.has('finance.expense.void')).toBe(true)
    expect(AUDITED_PERMISSIONS.has('employee.write')).toBe(false)
  })
})

describe('requirePermission', () => {
  it('401s when there is no session', async () => {
    const guard = requirePermission('payroll.approve')
    const request = stubRequest(stubAuth(null), stubPrisma(null))
    const stub = stubReply()
    await guard(request, stub.reply)
    expect(stub.statusCode).toBe(401)
    expect(stub.body).toEqual({ error: { message: 'Authentication required' } })
  })

  it('403s a MEMBER trying to approve payroll', async () => {
    const guard = requirePermission('payroll.approve')
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
    const prisma = stubPrisma({ role: 'MEMBER', employeeId: null })
    const request = stubRequest(auth, prisma)
    const stub = stubReply()
    await guard(request, stub.reply)
    expect(stub.statusCode).toBe(403)
    expect(stub.body).toEqual({ error: { message: "Requires the 'ADMIN' role or higher" } })
  })

  it('lets an ADMIN through and attaches authContext', async () => {
    const guard = requirePermission('payroll.approve')
    const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
    const prisma = stubPrisma({ role: 'ADMIN', employeeId: 'emp_1' })
    const request = stubRequest(auth, prisma)
    const stub = stubReply()
    await guard(request, stub.reply)
    expect(stub.statusCode).toBe(200)
    expect((request as unknown as { authContext?: unknown }).authContext).toEqual({
      userId: 'user_1',
      tenantId: 'tenant_1',
      role: 'ADMIN',
      employeeId: 'emp_1',
    })
  })
})
