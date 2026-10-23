import { Prisma, type PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { decryptBankDetail, encryptBankDetail } from '../src/services/crypto.js'
import { AppError } from '../src/utils/errors.js'
import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
} from '../src/modules/hr/employees.service.js'

const now = new Date('2026-01-01T00:00:00.000Z')

const baseRow = {
  id: 'emp_1',
  tenantId: 'tenant_1',
  name: 'Ada Lovelace',
  title: 'Staff Engineer',
  status: 'ACTIVE' as const,
  departmentId: 'dept_1',
  department: { name: 'Engineering' },
  managerId: null,
  manager: null,
  _count: { reports: 2 },
  salaryHistory: [],
  avatarUrl: null,
  hiredAt: now,
  employmentEndDate: null,
  salary: { toString: () => '185000.0000' } as unknown as Prisma.Decimal,
  equityOptions: null,
  band: 'L6',
  location: 'Remote',
  employeeNumber: 'E-001',
  email: 'ada@example.com',
  bankRoutingNumber: null,
  bankAccountNumber: null,
  bankAccountType: null,
  bankIban: null,
  bankBic: null,
  createdAt: now,
  updatedAt: now,
}

interface StubCalls {
  findManyArgs?: unknown
  countArgs: unknown[]
  createArgs?: unknown
  updateArgs?: unknown
  deleteArgs?: unknown
  candidateFindManyArgs?: unknown
  salaryHistoryCreate?: unknown
}

function stubPrisma(options: {
  employeeFindMany?: unknown[]
  employeeCounts?: number[]
  employeeFindFirst?: unknown | null | ((args: { where: { id?: string } }) => unknown | null)
  departmentFindFirst?: unknown | null
  employeeCreate?: unknown
  employeeUpdate?: unknown
  payrollLineCount?: number
  timesheetCount?: number
  tenantTimezone?: string
  candidateRoles?: string[]
  salaryHistoryCreate?: unknown
}) {
  const calls: StubCalls = { countArgs: [] }
  let countIndex = 0
  let employeeFindFirstCalls = 0
  const findEmployee = async (args: { where: { id?: string } }) => {
    employeeFindFirstCalls++
    if (typeof options.employeeFindFirst === 'function') return options.employeeFindFirst(args)
    if (employeeFindFirstCalls > 1 && options.employeeUpdate) return options.employeeUpdate
    return options.employeeFindFirst ?? null
  }

  const prisma = {
    employee: {
      findMany: async (args: unknown) => {
        calls.findManyArgs = args
        return options.employeeFindMany ?? []
      },
      count: async (args: unknown) => {
        calls.countArgs.push(args)
        const value = (options.employeeCounts ?? [0, 0, 0, 0, 0])[countIndex] ?? 0
        countIndex += 1
        return value
      },
      findFirst: async (args: { where: { id?: string } }) => {
        return findEmployee(args)
      },
      create: async (args: unknown) => {
        calls.createArgs = args
        return options.employeeCreate
      },
      update: async (args: unknown) => {
        calls.updateArgs = args
        return options.employeeUpdate
      },
      delete: async (args: unknown) => {
        calls.deleteArgs = args
      },
    },
    tenant: {
      findUnique: async () => ({ timezone: options.tenantTimezone ?? 'UTC', currency: 'USD' }),
    },
    department: {
      findFirst: async () => options.departmentFindFirst ?? null,
    },
    candidate: {
      // The database applies DISTINCT and the stage filter; the stub returns the resulting rows.
      findMany: async (args: unknown) => {
        calls.candidateFindManyArgs = args
        return (options.candidateRoles ?? []).map(role => ({ role }))
      },
    },
    payrollLine: { count: async () => options.payrollLineCount ?? 0 },
    timesheet: { count: async () => options.timesheetCount ?? 0 },
    employeeSalaryHistory: {
      findUnique: async () => null,
      create: async (args: unknown) => { calls.salaryHistoryCreate = args; return options.salaryHistoryCreate ?? {} },
    },
    auditLog: { create: async () => ({}) },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
      candidate: { updateMany: async () => ({ count: 0 }) },
      employee: {
        findFirst: async (args: { where: { id?: string } }) => {
          return findEmployee(args)
        },
        create: async (args: unknown) => { calls.createArgs = args; return options.employeeCreate },
        update: async (args: unknown) => { calls.updateArgs = args; return options.employeeUpdate },
        delete: async (args: unknown) => { calls.deleteArgs = args },
      },
      employeeSalaryHistory: {
        findUnique: async () => null,
        create: async (args: unknown) => { calls.salaryHistoryCreate = args; return options.salaryHistoryCreate ?? {} },
      },
      tenant: { findUnique: async () => ({ currency: 'USD' }) },
      auditLog: { create: async () => ({}) },
    }),
  } as unknown as PrismaClient

  return { prisma, calls }
}

describe('listEmployees', () => {
  it('redacts salary when the caller lacks employee.salary.read', async () => {
    const { prisma } = stubPrisma({
      employeeFindMany: [{
        ...baseRow,
        bankRoutingNumber: encryptBankDetail('021000021', 'tenant_1', 'routingNumber'),
        bankAccountNumber: encryptBankDetail('1234567890', 'tenant_1', 'accountNumber'),
      }],
      employeeCounts: [1, 0, 1, 0],
    })
    const result = await listEmployees(prisma, 'tenant_1', { page: 1, limit: 25 }, false)

    expect(result.items[0]?.salary).toBeNull()
    expect(result.items[0]?.bankRoutingNumber).toBeNull()
    expect(result.items[0]?.bankAccountNumber).toBeNull()
    expect(result.items[0]?.name).toBe('Ada Lovelace')
    expect(result.summary).toEqual({ totalHeadcount: 1, onLeaveCount: 0, hiredThisMonth: 0, hiredPreviousMonthToDate: 0, openRoles: 0 })
  })

  it('counts distinct recruitment roles with an open pipeline candidate as openRoles', async () => {
    const { prisma, calls } = stubPrisma({
      employeeFindMany: [baseRow],
      employeeCounts: [1, 0, 1, 0],
      candidateRoles: ['Staff Engineer', 'Product Designer'],
    })
    const result = await listEmployees(prisma, 'tenant_1', { page: 1, limit: 25 }, false)

    // Terminal stages (HIRED/REJECTED) are excluded and roles are de-duplicated in SQL.
    expect(calls.candidateFindManyArgs).toMatchObject({
      where: { tenantId: 'tenant_1', stage: { notIn: ['HIRED', 'REJECTED'] } },
      select: { role: true },
      distinct: ['role'],
    })
    expect(result.summary.openRoles).toBe(2)
  })

  it('includes salary when the caller has employee.salary.read', async () => {
    const { prisma } = stubPrisma({ employeeFindMany: [baseRow], employeeCounts: [1, 0, 1, 0] })
    const result = await listEmployees(prisma, 'tenant_1', { page: 1, limit: 25 }, true)
    expect(result.items[0]?.salary).toBe('185000.0000')
  })

  it('applies the requested server-side name order and page offset', async () => {
    const { prisma, calls } = stubPrisma({ employeeFindMany: [], employeeCounts: [60, 0, 60, 0] })
    const result = await listEmployees(prisma, 'tenant_1', { page: 2, limit: 25, sort: 'NAME_DESC' }, false)

    expect(calls.findManyArgs).toMatchObject({
      skip: 25,
      take: 25,
      orderBy: [{ name: 'desc' }, { id: 'asc' }],
    })
    expect(result.pagination).toEqual({ page: 2, limit: 25, total: 60, pages: 3 })
  })

  it('reports tenant-local hires this month and the matching prior-month period', async () => {
    const { prisma } = stubPrisma({ employeeFindMany: [], employeeCounts: [5, 1, 5, 2, 4] })
    const result = await listEmployees(prisma, 'tenant_1', { page: 1, limit: 25 }, false)
    expect(result.summary.hiredThisMonth).toBe(2)
    expect(result.summary.hiredPreviousMonthToDate).toBe(4)
  })

  it('bounds current and previous hire counts to same-length tenant-local periods', async () => {
    const { prisma, calls } = stubPrisma({ employeeFindMany: [], employeeCounts: [0, 0, 0, 0] })
    await listEmployees(prisma, 'tenant_1', { page: 1, limit: 25 }, false)
    const hiredCountWhere = (calls.countArgs[3] as { where: Record<string, unknown> }).where
    const previousHiredCountWhere = (calls.countArgs[4] as { where: Record<string, unknown> }).where
    expect(hiredCountWhere.tenantId).toBe('tenant_1')
    expect(hiredCountWhere.status).toEqual({ not: 'ARCHIVED' })
    expect(hiredCountWhere.hiredAt).toMatchObject({ gte: expect.any(Date), lt: expect.any(Date) })
    expect(previousHiredCountWhere.hiredAt).toMatchObject({ gte: expect.any(Date), lt: expect.any(Date) })
    const currentRange = hiredCountWhere.hiredAt as { gte: Date; lt: Date }
    const previousRange = previousHiredCountWhere.hiredAt as { gte: Date; lt: Date }
    expect(currentRange.lt.getTime() - currentRange.gte.getTime()).toBeGreaterThan(0)
    expect(previousRange.lt.getTime() - previousRange.gte.getTime()).toBeGreaterThan(0)
  })
})

describe('getEmployee', () => {
  it('throws a 404 AppError when the employee is not in this tenant', async () => {
    const { prisma } = stubPrisma({ employeeFindFirst: null })
    await expect(getEmployee(prisma, 'tenant_1', 'emp_missing', true)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('maps a found employee, including manager and department', async () => {
    const withManager = { ...baseRow, manager: { id: 'emp_2', name: 'Grace Hopper', title: 'VP Eng' } }
    const { prisma } = stubPrisma({ employeeFindFirst: withManager })
    const employee = await getEmployee(prisma, 'tenant_1', 'emp_1', true)
    expect(employee.manager).toEqual({ id: 'emp_2', name: 'Grace Hopper', title: 'VP Eng' })
    expect(employee.department).toBe('Engineering')
  })
})

describe('createEmployee', () => {
  it('rejects a departmentId that does not belong to the tenant', async () => {
    const { prisma } = stubPrisma({ departmentFindFirst: null })
    await expect(
      createEmployee(prisma, 'tenant_1', { name: 'New Hire', title: 'Engineer', departmentId: 'dept_other' }, true),
    ).rejects.toThrow(AppError)
  })

  it('rejects a managerId that does not belong to the tenant', async () => {
    const { prisma } = stubPrisma({ departmentFindFirst: { id: 'dept_1' }, employeeFindFirst: null })
    await expect(
      createEmployee(prisma, 'tenant_1', { name: 'New Hire', title: 'Engineer', managerId: 'emp_other' }, true),
    ).rejects.toThrow(AppError)
  })

  it('creates the employee once department and manager both check out', async () => {
    const { prisma, calls } = stubPrisma({
      departmentFindFirst: { id: 'dept_1' },
      employeeFindFirst: { id: 'emp_2' },
      employeeCreate: baseRow,
    })
    const employee = await createEmployee(
      prisma,
      'tenant_1',
      { name: 'Ada Lovelace', title: 'Staff Engineer', departmentId: 'dept_1', managerId: 'emp_2' },
      true,
    )
    expect(employee.name).toBe('Ada Lovelace')
    expect((calls.createArgs as { data: { tenantId: string } }).data.tenantId).toBe('tenant_1')
  })

  it('stores bank identifiers as tenant-bound ciphertext while returning the authorized value', async () => {
    const { prisma, calls } = stubPrisma({ employeeCreate: baseRow })
    await createEmployee(prisma, 'tenant_1', {
      name: 'Ada Lovelace', title: 'Staff Engineer', bankRoutingNumber: '021000021', bankAccountNumber: '1234567890',
    }, true)
    const data = (calls.createArgs as { data: Record<string, string | null> }).data
    expect(data.bankRoutingNumber).not.toBe('021000021')
    expect(data.bankAccountNumber).not.toBe('1234567890')
    expect(decryptBankDetail(data.bankRoutingNumber, 'tenant_1', 'routingNumber')).toBe('021000021')
    expect(decryptBankDetail(data.bankAccountNumber, 'tenant_1', 'accountNumber')).toBe('1234567890')
  })

  it('decrypts authorized employee bank details in the response mapper', async () => {
    const row = {
      ...baseRow,
      bankRoutingNumber: encryptBankDetail('021000021', 'tenant_1', 'routingNumber'),
      bankAccountNumber: encryptBankDetail('1234567890', 'tenant_1', 'accountNumber'),
    }
    const { prisma } = stubPrisma({ employeeFindFirst: row })
    const employee = await getEmployee(prisma, 'tenant_1', 'emp_1', true)
    expect(employee.bankRoutingNumber).toBe('021000021')
    expect(employee.bankAccountNumber).toBe('1234567890')
  })

  it('rejects an employment end date before the hire date', async () => {
    const { prisma } = stubPrisma({})
    await expect(createEmployee(prisma, 'tenant_1', {
      name: 'New Hire', title: 'Engineer', hiredAt: '2026-10-10', employmentEndDate: '2026-10-09',
    }, true)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('records the initial salary with an explicit effective date', async () => {
    const { prisma, calls } = stubPrisma({
      employeeCreate: baseRow,
      employeeFindFirst: { ...baseRow, salaryHistory: [{ salary: { toString: () => '120000' }, salaryBasis: 'ANNUAL', currency: 'USD', effectiveFrom: new Date('2026-10-01T00:00:00Z') }] },
    })
    await createEmployee(prisma, 'tenant_1', {
      name: 'Ada Lovelace', title: 'Staff Engineer', salary: '120000', salaryBasis: 'ANNUAL', salaryEffectiveFrom: '2026-10-01',
    }, true)
    expect(calls.salaryHistoryCreate).toMatchObject({ data: {
      tenantId: 'tenant_1', employeeId: 'emp_1', salary: '120000', salaryBasis: 'ANNUAL', currency: 'USD',
      effectiveFrom: new Date('2026-10-01T00:00:00Z'),
    } })
  })
})

describe('updateEmployee', () => {
  it('404s when the employee does not exist in this tenant', async () => {
    const { prisma } = stubPrisma({ employeeFindFirst: null })
    await expect(updateEmployee(prisma, 'tenant_1', 'emp_missing', { name: 'X' }, true)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('only re-validates departmentId/managerId when they are actually part of the patch', async () => {
    const { prisma } = stubPrisma({
      employeeFindFirst: baseRow,
      employeeUpdate: baseRow,
    })
    // No departmentId/managerId in the patch, so department.findFirst must never be called to
    // reject it \u2014 this exercises the `!== undefined` guards in updateEmployee.
    await expect(updateEmployee(prisma, 'tenant_1', 'emp_1', { title: 'Principal Engineer' }, true)).resolves.toBeDefined()
  })

  it('serializes the employment end date as a calendar day', async () => {
    const { prisma } = stubPrisma({
      employeeFindFirst: baseRow,
      employeeUpdate: { ...baseRow, employmentEndDate: new Date('2026-10-16T00:00:00.000Z') },
    })
    const employee = await updateEmployee(prisma, 'tenant_1', 'emp_1', { employmentEndDate: '2026-10-16' }, true)
    expect(employee.employmentEndDate).toBe('2026-10-16')
  })

  it('requires and records an effective date when salary changes', async () => {
    const { prisma, calls } = stubPrisma({ employeeFindFirst: baseRow, employeeUpdate: baseRow })
    await expect(updateEmployee(prisma, 'tenant_1', 'emp_1', { salary: '200000' }, true)).rejects.toMatchObject({ statusCode: 400 })
    await updateEmployee(prisma, 'tenant_1', 'emp_1', { salary: '200000', salaryEffectiveFrom: '2026-10-01' }, true)
    expect(calls.salaryHistoryCreate).toMatchObject({ data: {
      tenantId: 'tenant_1', employeeId: 'emp_1', salary: '200000', currency: 'USD',
      effectiveFrom: new Date('2026-10-01T00:00:00Z'),
    } })
  })
})

describe('deleteEmployee', () => {
  it('404s when the employee does not exist in this tenant', async () => {
    const { prisma } = stubPrisma({ employeeFindFirst: null })
    await expect(deleteEmployee(prisma, 'tenant_1', 'emp_missing')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deletes once tenant ownership is confirmed', async () => {
    const { prisma, calls } = stubPrisma({ employeeFindFirst: baseRow })
    await deleteEmployee(prisma, 'tenant_1', 'emp_1')
    expect((calls.deleteArgs as { where: { id_tenantId: { id: string; tenantId: string } } }).where.id_tenantId).toEqual({ id: 'emp_1', tenantId: 'tenant_1' })
  })

  it('archives employees with payroll history to preserve records', async () => {
    const { prisma, calls } = stubPrisma({ employeeFindFirst: baseRow, payrollLineCount: 1 })
    await deleteEmployee(prisma, 'tenant_1', 'emp_1')
    expect(calls.updateArgs).toMatchObject({ where: { id_tenantId: { id: 'emp_1', tenantId: 'tenant_1' } }, data: { status: 'ARCHIVED' } })
    expect(calls.deleteArgs).toBeUndefined()
  })
})
