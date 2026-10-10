import type { Prisma, PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
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
  name: 'Ada Lovelace',
  title: 'Staff Engineer',
  status: 'ACTIVE' as const,
  departmentId: 'dept_1',
  department: { name: 'Engineering' },
  managerId: null,
  manager: null,
  _count: { reports: 2 },
  avatarUrl: null,
  hiredAt: now,
  salary: { toString: () => '185000.0000' } as unknown as Prisma.Decimal,
  equityOptions: null,
  band: 'L6',
  location: 'Remote',
  employeeNumber: 'E-001',
  email: 'ada@example.com',
  createdAt: now,
  updatedAt: now,
}

interface StubCalls {
  findManyArgs?: unknown
  countArgs: unknown[]
  createArgs?: unknown
  updateArgs?: unknown
  deleteArgs?: unknown
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
}) {
  const calls: StubCalls = { countArgs: [] }
  let countIndex = 0

  const prisma = {
    employee: {
      findMany: async (args: unknown) => {
        calls.findManyArgs = args
        return options.employeeFindMany ?? []
      },
      count: async (args: unknown) => {
        calls.countArgs.push(args)
        const value = (options.employeeCounts ?? [0, 0, 0, 0])[countIndex] ?? 0
        countIndex += 1
        return value
      },
      findFirst: async (args: { where: { id?: string } }) => {
        if (typeof options.employeeFindFirst === 'function') return options.employeeFindFirst(args)
        return options.employeeFindFirst ?? null
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
      findUnique: async () => ({ timezone: options.tenantTimezone ?? 'UTC' }),
    },
    department: {
      findFirst: async () => options.departmentFindFirst ?? null,
    },
    payrollLine: { count: async () => options.payrollLineCount ?? 0 },
    timesheet: { count: async () => options.timesheetCount ?? 0 },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
      candidate: { updateMany: async () => ({ count: 0 }) },
      employee: { delete: async (args: unknown) => { calls.deleteArgs = args } },
    }),
  } as unknown as PrismaClient

  return { prisma, calls }
}

describe('listEmployees', () => {
  it('redacts salary when the caller lacks employee.salary.read', async () => {
    const { prisma } = stubPrisma({ employeeFindMany: [baseRow], employeeCounts: [1, 0, 1, 0] })
    const result = await listEmployees(prisma, 'tenant_1', { page: 1, limit: 25 }, false)

    expect(result.items[0]?.salary).toBeNull()
    expect(result.items[0]?.name).toBe('Ada Lovelace')
    expect(result.summary).toEqual({ totalHeadcount: 1, onLeaveCount: 0, hiredThisMonth: 0, openRoles: 0 })
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

  it('reports hires this month from the fourth tenant-wide count', async () => {
    const { prisma } = stubPrisma({ employeeFindMany: [], employeeCounts: [5, 1, 5, 2] })
    const result = await listEmployees(prisma, 'tenant_1', { page: 1, limit: 25 }, false)
    expect(result.summary.hiredThisMonth).toBe(2)
  })

  it('scopes the hired-this-month count to non-archived employees with a recorded hire date', async () => {
    const { prisma, calls } = stubPrisma({ employeeFindMany: [], employeeCounts: [0, 0, 0, 0] })
    await listEmployees(prisma, 'tenant_1', { page: 1, limit: 25 }, false)
    const hiredCountWhere = (calls.countArgs[3] as { where: Record<string, unknown> }).where
    expect(hiredCountWhere.tenantId).toBe('tenant_1')
    expect(hiredCountWhere.status).toEqual({ not: 'ARCHIVED' })
    // The month boundary is derived from the tenant-local today; the stub tenant is UTC and the
    // test clock is irrelevant because the filter shape — a gte on hiredAt — is what matters.
    expect(hiredCountWhere.hiredAt).toMatchObject({ gte: expect.any(Date) })
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
