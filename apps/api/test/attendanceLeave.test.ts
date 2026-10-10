import type { Prisma } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLeaveRequestInTransaction, decideLeaveRequestInTransaction, getLeaveBalances } from '../src/modules/hr/attendance.service.js'

afterEach(() => vi.useRealTimers())

const employee = { id: 'employee_1', name: 'Rana', avatarUrl: null, departmentId: null, status: 'ACTIVE', department: null }
const request = {
  id: 'leave_1', tenantId: 'tenant_1', employeeId: 'employee_1', type: 'VACATION',
  startDate: new Date('2026-10-07T00:00:00.000Z'), endDate: new Date('2026-10-08T00:00:00.000Z'),
  status: 'PENDING', createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-01T00:00:00.000Z'), employee,
}

describe('leave request workflow', () => {
  it('creates a request for the linked active employee and rejects overlapping pending/approved leave', async () => {
    const tx = {
      employee: { findFirst: vi.fn().mockResolvedValue({ id: employee.id }) },
      leavePolicy: { findUnique: vi.fn().mockResolvedValue(null) },
      leaveRequest: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'leave_existing' }),
        create: vi.fn().mockResolvedValue(request),
      },
    } as unknown as Prisma.TransactionClient
    const created = await createLeaveRequestInTransaction(tx, 'tenant_1', employee.id, {
      type: 'VACATION', startDate: '2026-10-07', endDate: '2026-10-08',
    })
    expect(created).toMatchObject({ id: 'leave_1', employeeId: employee.id, status: 'PENDING' })
    expect(tx.leaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant_1', employeeId: employee.id, status: 'PENDING' }),
    }))
    expect(tx.leaveRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant_1', employeeId: employee.id, status: { in: ['PENDING', 'APPROVED'] } }),
    }))
    await expect(createLeaveRequestInTransaction(tx, 'tenant_1', employee.id, {
      type: 'SICK', startDate: '2026-10-08', endDate: '2026-10-09',
    })).rejects.toThrow('overlapping dates')
  })

  it('sets ON_LEAVE when approving a request effective today in the tenant timezone', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'))
    const tx = {
      leaveRequest: {
        findFirst: vi.fn().mockResolvedValueOnce(request).mockResolvedValueOnce(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
      leavePolicy: { findUnique: vi.fn().mockResolvedValue(null) },
      employee: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as Prisma.TransactionClient
    const result = await decideLeaveRequestInTransaction(tx, 'tenant_1', request.id, 'APPROVED')
    expect(result.status).toBe('APPROVED')
    expect(tx.employee.updateMany).toHaveBeenCalledWith({
      where: { id: employee.id, tenantId: 'tenant_1', status: 'ACTIVE' }, data: { status: 'ON_LEAVE' },
    })
    expect(tx.leaveRequest.updateMany).toHaveBeenCalledWith({
      where: { id: request.id, tenantId: 'tenant_1', status: 'PENDING' }, data: { status: 'APPROVED' },
    })
  })

  it('does not mark an employee on leave before a future request starts and does not mutate employee status on rejection', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'))
    const futureRequest = { ...request, startDate: new Date('2026-10-07T00:00:00.000Z'), endDate: null }
    const tx = {
      leaveRequest: {
        findFirst: vi.fn().mockResolvedValueOnce(futureRequest).mockResolvedValueOnce(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
      leavePolicy: { findUnique: vi.fn().mockResolvedValue(null) },
      employee: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as Prisma.TransactionClient
    const approved = await decideLeaveRequestInTransaction(tx, 'tenant_1', request.id, 'APPROVED')
    expect(approved.status).toBe('APPROVED')
    expect(tx.employee.updateMany).not.toHaveBeenCalled()

    const rejectedTx = {
      leaveRequest: {
        findFirst: vi.fn().mockResolvedValueOnce(request), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      tenant: { findUnique: vi.fn() },
      leavePolicy: { findUnique: vi.fn().mockResolvedValue(null) },
      employee: { updateMany: vi.fn() },
    } as unknown as Prisma.TransactionClient
    const rejected = await decideLeaveRequestInTransaction(rejectedTx, 'tenant_1', request.id, 'REJECTED')
    expect(rejected.status).toBe('REJECTED')
    expect(rejectedTx.employee.updateMany).not.toHaveBeenCalled()
    expect(rejectedTx.tenant.findUnique).not.toHaveBeenCalled()
  })

  it('reserves pending weekdays and rejects a request that exceeds the configured annual allowance', async () => {
    const tx = {
      employee: { findFirst: vi.fn().mockResolvedValue({ id: employee.id }) },
      leavePolicy: { findUnique: vi.fn().mockResolvedValue({ annualAllowanceDays: 2, weekdaysOnly: true }) },
      $queryRaw: vi.fn().mockResolvedValue([{ days: 0n }]),
      leaveRequest: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    } as unknown as Prisma.TransactionClient
    await expect(createLeaveRequestInTransaction(tx, 'tenant_1', employee.id, {
      type: 'VACATION', startDate: '2026-10-05', endDate: '2026-10-07',
    })).rejects.toThrow('allowance for 2026 would be exceeded')
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(tx.leaveRequest.create).not.toHaveBeenCalled()
  })

  it('returns approved and pending leave usage with a nullable balance when a policy is not configured', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
      employee: { findMany: vi.fn().mockResolvedValue([{ id: employee.id, name: employee.name, departmentId: 'department_1' }]) },
      leavePolicy: { findMany: vi.fn().mockResolvedValue([{ type: 'VACATION', annualAllowanceDays: 10, weekdaysOnly: true }]) },
      $queryRaw: vi.fn().mockResolvedValue([
        { employeeId: employee.id, type: 'VACATION', status: 'APPROVED', days: 4n },
        { employeeId: employee.id, type: 'VACATION', status: 'PENDING', days: 2n },
        { employeeId: employee.id, type: 'SICK', status: 'APPROVED', days: 1n },
      ]),
    }
    const result = await getLeaveBalances(prisma as unknown as import('@prisma/client').PrismaClient, 'tenant_1', { year: 2026 }, employee.id)
    expect(result).toMatchObject({ year: 2026, items: [
      { employeeId: employee.id, type: 'VACATION', annualAllowanceDays: 10, approvedDays: 4, pendingDays: 2, remainingDays: 4, weekdaysOnly: true },
      { employeeId: employee.id, type: 'SICK', annualAllowanceDays: null, approvedDays: 1, pendingDays: 0, remainingDays: null, weekdaysOnly: null },
      { employeeId: employee.id, type: 'PERSONAL', approvedDays: 0, pendingDays: 0, remainingDays: null },
    ] })
    expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant_1', status: { not: 'ARCHIVED' }, id: employee.id } }))
  })
})
