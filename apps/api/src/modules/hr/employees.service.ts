import type { Employee as PrismaEmployee, Prisma, PrismaClient } from '@prisma/client'
import type {
  Employee,
  EmployeeListQuery,
  EmployeeSummary,
  EmployeeUpdateInput,
  EmployeeWriteInput,
} from '@asas/contracts'
import { buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

const employeeInclude = {
  department: true,
  manager: { select: { id: true, name: true, title: true } },
  _count: { select: { reports: true } },
} as const

type PrismaEmployeeWithIncludes = PrismaEmployee & {
  department: { name: string } | null
  manager: { id: string; name: string; title: string } | null
  _count: { reports: number }
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
    salary: canReadSalary ? (employee.salary?.toString() ?? null) : null,
    equityOptions: employee.equityOptions,
    band: employee.band,
    location: employee.location,
    employeeNumber: employee.employeeNumber,
    email: employee.email,
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
  const [items, total, onLeaveCount, totalHeadcount] = await Promise.all([
    prisma.employee.findMany({ where, skip, take, orderBy: { name: 'asc' }, include: employeeInclude }),
    prisma.employee.count({ where }),
    prisma.employee.count({ where: { tenantId, status: 'ON_LEAVE' } }),
    prisma.employee.count({ where: { tenantId, status: { not: 'ARCHIVED' } } }),
  ])

  return {
    items: items.map(item => mapEmployee(item, canReadSalary)),
    pagination: buildPaginationMeta(query, total),
    summary: {
      totalHeadcount,
      onLeaveCount,
      // See employeeSummarySchema.openRoles: no requisition model exists yet to compute this from.
      openRoles: 0,
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
): Promise<Employee> {
  await assertDepartmentInTenant(prisma, tenantId, input.departmentId)
  await assertManagerInTenant(prisma, tenantId, input.managerId)

  const employee = await prisma.employee.create({
    data: {
      tenantId,
      name: input.name,
      title: input.title,
      departmentId: input.departmentId ?? null,
      managerId: input.managerId ?? null,
      status: input.status ?? 'ACTIVE',
      avatarUrl: input.avatarUrl ?? null,
      hiredAt: input.hiredAt ? new Date(input.hiredAt) : null,
      salary: input.salary ?? null,
      equityOptions: input.equityOptions ?? null,
      band: input.band ?? null,
      location: input.location ?? null,
      employeeNumber: input.employeeNumber ?? null,
      email: input.email ?? null,
    },
    include: employeeInclude,
  })
  return mapEmployee(employee, canReadSalary)
}

export async function updateEmployee(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: EmployeeUpdateInput,
  canReadSalary: boolean,
): Promise<Employee> {
  const existing = await prisma.employee.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Employee not found')

  if (input.departmentId !== undefined) await assertDepartmentInTenant(prisma, tenantId, input.departmentId)
  if (input.managerId !== undefined) await assertManagerInTenant(prisma, tenantId, input.managerId)

  const employee = await prisma.employee.update({
    where: { id_tenantId: { id, tenantId } },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.departmentId !== undefined && { departmentId: input.departmentId }),
      ...(input.managerId !== undefined && { managerId: input.managerId }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      ...(input.hiredAt !== undefined && { hiredAt: input.hiredAt ? new Date(input.hiredAt) : null }),
      ...(input.salary !== undefined && { salary: input.salary }),
      ...(input.equityOptions !== undefined && { equityOptions: input.equityOptions }),
      ...(input.band !== undefined && { band: input.band }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.employeeNumber !== undefined && { employeeNumber: input.employeeNumber }),
      ...(input.email !== undefined && { email: input.email }),
    },
    include: employeeInclude,
  })
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
  await prisma.employee.delete({ where: { id_tenantId: { id, tenantId } } })
}
