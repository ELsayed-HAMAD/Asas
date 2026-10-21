import { Prisma, type Employee as PrismaEmployee, type PrismaClient } from '@prisma/client'
import type {
  Employee,
  EmployeeListQuery,
  EmployeeSummary,
  EmployeeUpdateInput,
  EmployeeWriteInput,
} from '@asas/contracts'
import { buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'
import { monthToDateComparisonPeriods, tenantToday } from '../../utils/dates.js'
import { recordAuditLog } from '../../services/auditLog.js'

const employeeInclude = {
  department: true,
  manager: { select: { id: true, name: true, title: true } },
  _count: { select: { reports: true } },
  salaryHistory: { orderBy: { effectiveFrom: 'desc' } },
} as const

type PrismaEmployeeWithIncludes = PrismaEmployee & {
  department: { name: string } | null
  manager: { id: string; name: string; title: string } | null
  _count: { reports: number }
  salaryHistory: { salary: Prisma.Decimal; salaryBasis: 'ANNUAL' | 'MONTHLY' | null; currency: string; effectiveFrom: Date }[]
}

/**
 * Maps a Prisma row onto the wire shape. `canReadSalary` is the one place `employee.salary`
 * gets redacted \u2014 see the `employee.salary.read` permission in middlewares/permissions.ts.
 * Every caller of this function passes an explicit boolean rather than a default, so a new
 * call site cannot silently leak salary by omission.
 */
function mapEmployee(employee: PrismaEmployeeWithIncludes, canReadSalary: boolean): Employee {
  return {
    id: employee.id,
    name: employee.name,
    title: employee.title,
    status: employee.status,
    departmentId: employee.departmentId,
    department: employee.department?.name ?? null,
    managerId: employee.managerId,
    manager: employee.manager,
    directReports: employee._count.reports,
    avatarUrl: employee.avatarUrl,
    hiredAt: employee.hiredAt?.toISOString() ?? null,
    employmentEndDate: employee.employmentEndDate?.toISOString().slice(0, 10) ?? null,
    salary: canReadSalary ? (employee.salary?.toString() ?? null) : null,
    salaryBasis: canReadSalary ? (employee.salaryBasis ?? null) : null,
    salaryEffectiveFrom: canReadSalary ? employee.salaryHistory[0]?.effectiveFrom.toISOString().slice(0, 10) ?? null : null,
    salaryHistory: canReadSalary ? employee.salaryHistory.map(rate => ({
      salary: rate.salary.toString(), salaryBasis: rate.salaryBasis, currency: rate.currency,
      effectiveFrom: rate.effectiveFrom.toISOString().slice(0, 10),
    })) : [],
    equityOptions: employee.equityOptions,
    band: employee.band,
    location: employee.location,
    employeeNumber: employee.employeeNumber,
    email: employee.email,
    bankRoutingNumber: canReadSalary ? (employee.bankRoutingNumber ?? null) : null,
    bankAccountNumber: canReadSalary ? (employee.bankAccountNumber ?? null) : null,
    bankAccountType: canReadSalary ? (employee.bankAccountType ?? null) : null,
    bankIban: canReadSalary ? (employee.bankIban ?? null) : null,
    bankBic: canReadSalary ? (employee.bankBic ?? null) : null,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  }
}

/** Throws unless `departmentId` (when provided) names a department in this tenant. */
async function assertDepartmentInTenant(
  prisma: PrismaClient,
  tenantId: string,
  departmentId: string | null | undefined,
): Promise<void> {
  if (!departmentId) return
  const department = await prisma.department.findFirst({ where: { id: departmentId, tenantId } })
  if (!department) throw new AppError(400, 'Department does not belong to this workspace')
}

/** Throws unless `managerId` (when provided) names an employee in this tenant. */
async function assertManagerInTenant(
  prisma: PrismaClient,
  tenantId: string,
  managerId: string | null | undefined,
): Promise<void> {
  if (!managerId) return
  const manager = await prisma.employee.findFirst({ where: { id: managerId, tenantId } })
  if (!manager) throw new AppError(400, 'Manager does not belong to this workspace')
}

export interface EmployeeListResult {
  items: Employee[]
  pagination: ReturnType<typeof buildPaginationMeta>
  summary: EmployeeSummary
}

export async function listEmployees(
  prisma: PrismaClient,
  tenantId: string,
  query: EmployeeListQuery,
  canReadSalary: boolean,
): Promise<EmployeeListResult> {
  const where: Prisma.EmployeeWhereInput = { tenantId, status: { not: 'ARCHIVED' } }
  if (query.departmentId) where.departmentId = query.departmentId
  if (query.status === 'Active') where.status = 'ACTIVE'
  if (query.status === 'On Leave') where.status = 'ON_LEAVE'
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { title: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
      { employeeNumber: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  const { skip, take } = toPrismaPage(query)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
  const timezone = tenant?.timezone ?? 'UTC'
  const periods = monthToDateComparisonPeriods(tenantToday(timezone))
  const currentHirePeriod = {
    gte: new Date(`${periods.current.startDate}T00:00:00.000Z`),
    lt: new Date(`${periods.current.endDateExclusive}T00:00:00.000Z`),
  }
  const previousHirePeriod = {
    gte: new Date(`${periods.previous.startDate}T00:00:00.000Z`),
    lt: new Date(`${periods.previous.endDateExclusive}T00:00:00.000Z`),
  }

  const [items, total, onLeaveCount, totalHeadcount, hiredThisMonth, hiredPreviousMonthToDate, openRoleRows] = await Promise.all([
    prisma.employee.findMany({
      where, skip, take,
      orderBy: query.sort === 'NAME_DESC' ? [{ name: 'desc' }, { id: 'asc' }] : [{ name: 'asc' }, { id: 'asc' }],
      include: employeeInclude,
    }),
    prisma.employee.count({ where }),
    prisma.employee.count({ where: { tenantId, status: 'ON_LEAVE' } }),
    prisma.employee.count({ where: { tenantId, status: { not: 'ARCHIVED' } } }),
    prisma.employee.count({ where: { tenantId, status: { not: 'ARCHIVED' }, hiredAt: currentHirePeriod } }),
    prisma.employee.count({ where: { tenantId, status: { not: 'ARCHIVED' }, hiredAt: previousHirePeriod } }),
    // Distinct recruitment roles with at least one candidate still in a non-terminal stage.
    prisma.candidate.findMany({
      where: { tenantId, stage: { notIn: ['HIRED', 'REJECTED'] } },
      select: { role: true },
      distinct: ['role'],
    }),
  ])

  return {
    items: items.map(item => mapEmployee(item, canReadSalary)),
    pagination: buildPaginationMeta(query, total),
    summary: {
      totalHeadcount,
      onLeaveCount,
      hiredThisMonth,
      hiredPreviousMonthToDate,
      // Real count of distinct candidate `role` values with an open (non-HIRED/non-REJECTED)
      // pipeline candidate. No requisition model exists yet, so this counts recruited-for
      // roles, not approved headcount requisitions.
      openRoles: openRoleRows.length,
    },
  }
}

export async function getEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  canReadSalary: boolean,
): Promise<Employee> {
  const employee = await prisma.employee.findFirst({ where: { id, tenantId }, include: employeeInclude })
  if (!employee) throw new AppError(404, 'Employee not found')
  return mapEmployee(employee, canReadSalary)
}

export async function createEmployee(
  prisma: PrismaClient,
  tenantId: string,
  input: EmployeeWriteInput,
  canReadSalary: boolean,
  actorId?: string,
): Promise<Employee> {
  await assertDepartmentInTenant(prisma, tenantId, input.departmentId)
  await assertManagerInTenant(prisma, tenantId, input.managerId)
  if (input.hiredAt && input.employmentEndDate && input.employmentEndDate < input.hiredAt) {
    throw new AppError(400, 'Employment end date cannot be before the hire date')
  }
  if (input.salaryEffectiveFrom && input.employmentEndDate && input.salaryEffectiveFrom > input.employmentEndDate) {
    throw new AppError(400, 'Salary effective date cannot be after the employment end date')
  }

  if (input.salary != null && !input.salaryEffectiveFrom) throw new AppError(400, 'Choose the date this salary becomes effective')
  const employee = await prisma.$transaction(async tx => {
    const created = await tx.employee.create({
      data: {
      tenantId,
      name: input.name,
      title: input.title,
      departmentId: input.departmentId ?? null,
      managerId: input.managerId ?? null,
      status: input.status ?? 'ACTIVE',
      avatarUrl: input.avatarUrl ?? null,
      hiredAt: input.hiredAt ? new Date(input.hiredAt) : null,
      employmentEndDate: input.employmentEndDate ? new Date(`${input.employmentEndDate}T00:00:00.000Z`) : null,
      salary: input.salary ?? null,
      salaryBasis: input.salaryBasis ?? null,
      equityOptions: input.equityOptions ?? null,
      band: input.band ?? null,
      location: input.location ?? null,
      employeeNumber: input.employeeNumber ?? null,
      email: input.email ?? null,
      bankRoutingNumber: input.bankRoutingNumber ?? null,
      bankAccountNumber: input.bankAccountNumber ?? null,
      bankAccountType: input.bankAccountType ?? null,
      bankIban: input.bankIban ?? null,
      bankBic: input.bankBic ?? null,
      },
      include: employeeInclude,
    })
    if (input.salary != null) {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
      if (!tenant) throw new AppError(404, 'Workspace not found')
      await tx.employeeSalaryHistory.create({ data: {
        tenantId, employeeId: created.id, salary: input.salary, salaryBasis: input.salaryBasis ?? null,
        currency: tenant.currency, effectiveFrom: input.salaryEffectiveFrom ? new Date(`${input.salaryEffectiveFrom}T00:00:00.000Z`) : (created.hiredAt ?? new Date()), createdById: actorId ?? null,
      } })
      if (actorId) await recordAuditLog(tx, {
        tenantId, actorId, action: 'hr.employee.salary.rate.create', targetType: 'Employee', targetId: created.id,
        metadata: { salary: input.salary, salaryBasis: input.salaryBasis ?? null, effectiveFrom: input.salaryEffectiveFrom ?? created.hiredAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10), currency: tenant.currency },
      })
    }
    if (input.salary == null) return created
    const withHistory = await tx.employee.findFirst({ where: { id: created.id, tenantId }, include: employeeInclude })
    if (!withHistory) throw new AppError(500, 'Created employee could not be loaded')
    return withHistory
  }, { isolationLevel: 'Serializable' })
  return mapEmployee(employee, canReadSalary)
}

export async function updateEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: EmployeeUpdateInput,
  canReadSalary: boolean,
  actorId?: string,
): Promise<Employee> {
  const existing = await prisma.employee.findFirst({ where: { id, tenantId }, include: { salaryHistory: { orderBy: { effectiveFrom: 'desc' } } } })
  if (!existing) throw new AppError(404, 'Employee not found')

  if (input.departmentId !== undefined) await assertDepartmentInTenant(prisma, tenantId, input.departmentId)
  if (input.managerId !== undefined) await assertManagerInTenant(prisma, tenantId, input.managerId)

  const hiredAt = input.hiredAt !== undefined ? input.hiredAt : existing.hiredAt?.toISOString().slice(0, 10) ?? null
  const employmentEndDate = input.employmentEndDate !== undefined ? input.employmentEndDate : existing.employmentEndDate?.toISOString().slice(0, 10) ?? null
  if (hiredAt && employmentEndDate && employmentEndDate < hiredAt.slice(0, 10)) {
    throw new AppError(400, 'Employment end date cannot be before the hire date')
  }

  const salaryChanged = input.salary !== undefined && (input.salary === null
    ? existing.salary !== null
    : existing.salary === null || !new Prisma.Decimal(input.salary).equals(new Prisma.Decimal(existing.salary.toString())))
  const salaryBasisChanged = input.salaryBasis !== undefined && input.salaryBasis !== existing.salaryBasis
  const salaryChangedAt = salaryChanged || salaryBasisChanged
  if (input.salary === null && existing.salary !== null) throw new AppError(400, 'Use an explicit zero salary rate instead of clearing a recorded salary')
  if (salaryChangedAt && !input.salaryEffectiveFrom) throw new AppError(400, 'Choose the date this salary change becomes effective')
  if (salaryChangedAt && input.salaryEffectiveFrom && hiredAt && input.salaryEffectiveFrom < hiredAt.slice(0, 10)) {
    throw new AppError(400, 'Salary effective date cannot be before the hire date')
  }
  if (salaryChangedAt && input.salaryEffectiveFrom && employmentEndDate && input.salaryEffectiveFrom > employmentEndDate) {
    throw new AppError(400, 'Salary effective date cannot be after the employment end date')
  }

  const employee = await prisma.$transaction(async tx => {
    const rateSalary = input.salary !== undefined ? input.salary : existing.salary?.toString() ?? null
    const rateBasis = input.salaryBasis !== undefined ? input.salaryBasis : existing.salaryBasis
    if (salaryChangedAt) {
      if (rateSalary === null) throw new AppError(400, 'A salary rate is required for an effective-dated change')
      const alreadyRecorded = await tx.employeeSalaryHistory.findUnique({ where: { employeeId_effectiveFrom: { employeeId: id, effectiveFrom: new Date(`${input.salaryEffectiveFrom}T00:00:00.000Z`) } } })
      if (alreadyRecorded) throw new AppError(409, 'A salary rate is already recorded for that effective date; choose another date')
    }
    const latestRateDate = existing.salaryHistory[0]?.effectiveFrom
    const updateCurrentSalary = salaryChangedAt && (!latestRateDate || new Date(`${input.salaryEffectiveFrom}T00:00:00.000Z`) > latestRateDate)
    const updated = await tx.employee.update({
      where: { id_tenantId: { id, tenantId } },
      data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
      ...(input.managerId !== undefined && { managerId: input.managerId }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      ...(input.hiredAt !== undefined && { hiredAt: input.hiredAt ? new Date(input.hiredAt) : null }),
      ...(input.employmentEndDate !== undefined && { employmentEndDate: input.employmentEndDate ? new Date(`${input.employmentEndDate}T00:00:00.000Z`) : null }),
      ...(updateCurrentSalary && { salary: rateSalary, salaryBasis: rateBasis }),
      ...(input.equityOptions !== undefined && { equityOptions: input.equityOptions }),
      ...(input.band !== undefined && { band: input.band }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.employeeNumber !== undefined && { employeeNumber: input.employeeNumber }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.bankRoutingNumber !== undefined && { bankRoutingNumber: input.bankRoutingNumber }),
      ...(input.bankAccountNumber !== undefined && { bankAccountNumber: input.bankAccountNumber }),
      ...(input.bankAccountType !== undefined && { bankAccountType: input.bankAccountType }),
      ...(input.bankIban !== undefined && { bankIban: input.bankIban }),
      ...(input.bankBic !== undefined && { bankBic: input.bankBic }),
      },
    })
    if (salaryChangedAt && input.salaryEffectiveFrom && rateSalary !== null) {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
      if (!tenant) throw new AppError(404, 'Workspace not found')
      await tx.employeeSalaryHistory.create({ data: {
        tenantId, employeeId: id, salary: rateSalary, salaryBasis: rateBasis, currency: updated.currency ?? tenant.currency,
        effectiveFrom: new Date(`${input.salaryEffectiveFrom}T00:00:00.000Z`), createdById: actorId ?? null,
      } })
      if (actorId) await recordAuditLog(tx, {
        tenantId, actorId, action: 'hr.employee.salary.rate.create', targetType: 'Employee', targetId: id,
        metadata: { salary: rateSalary, salaryBasis: rateBasis, effectiveFrom: input.salaryEffectiveFrom, currency: updated.currency ?? tenant.currency },
      })
    }
    const withHistory = await tx.employee.findFirst({ where: { id, tenantId }, include: employeeInclude })
    if (!withHistory) throw new AppError(404, 'Employee not found')
    return withHistory
  }, { isolationLevel: 'Serializable' })
  return mapEmployee(employee, canReadSalary)
}

export async function deleteEmployee(prisma: PrismaClient, tenantId: string, id: string): Promise<void> {
  const existing = await prisma.employee.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Employee not found')
  const [payrollLines, timesheets] = await Promise.all([
    prisma.payrollLine.count({ where: { employeeId: id, tenantId } }),
    prisma.timesheet.count({ where: { employeeId: id, tenantId } }),
  ])
  if (payrollLines || timesheets) {
    await prisma.employee.update({ where: { id_tenantId: { id, tenantId } }, data: { status: 'ARCHIVED' } })
    return
  }
  await prisma.$transaction(async tx => {
    await tx.candidate.updateMany({ where: { tenantId, employeeId: id }, data: { employeeId: null } })
    await tx.employee.delete({ where: { id_tenantId: { id, tenantId } } })
  })
}
