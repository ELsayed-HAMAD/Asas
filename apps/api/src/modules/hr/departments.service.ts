import type { Prisma, PrismaClient } from '@prisma/client'
import type { Department, DepartmentWriteInput } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

type DbClient = PrismaClient | Prisma.TransactionClient

export async function listDepartments(prisma: DbClient, tenantId: string): Promise<Department[]> {
  const departments = await prisma.department.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
  return departments.map(department => ({
    id: department.id,
    name: department.name,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  }))
}

export async function createDepartment(
  prisma: DbClient,
  tenantId: string,
  input: DepartmentWriteInput,
): Promise<Department> {
  const existing = await prisma.department.findFirst({ where: { tenantId, name: input.name } })
  if (existing) throw new AppError(409, 'A department with this name already exists')

  try {
    const department = await prisma.department.create({ data: { tenantId, name: input.name } })
    return {
      id: department.id,
      name: department.name,
      createdAt: department.createdAt.toISOString(),
      updatedAt: department.updatedAt.toISOString(),
    }
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new AppError(409, 'A department with this name already exists')
    }
    throw err
  }
}

export async function updateDepartment(
  prisma: DbClient,
  tenantId: string,
  id: string,
  input: DepartmentWriteInput,
): Promise<Department> {
  const existing = await prisma.department.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Department not found')

  if (input.name !== existing.name) {
    const duplicate = await prisma.department.findFirst({
      where: { tenantId, name: input.name, id: { not: id } },
    })
    if (duplicate) throw new AppError(409, 'A department with this name already exists')
  }

  try {
    const department = await prisma.department.update({
      where: { id },
      data: { name: input.name },
    })
    return {
      id: department.id,
      name: department.name,
      createdAt: department.createdAt.toISOString(),
      updatedAt: department.updatedAt.toISOString(),
    }
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new AppError(409, 'A department with this name already exists')
    }
    throw err
  }
}

export async function deleteDepartment(
  prisma: DbClient,
  tenantId: string,
  id: string,
): Promise<void> {
  const existing = await prisma.department.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Department not found')

  const activeEmployees = await prisma.employee.count({
    where: { tenantId, departmentId: id, status: { not: 'ARCHIVED' } },
  })
  if (activeEmployees > 0) {
    throw new AppError(400, `Cannot delete department with ${activeEmployees} active employee(s). Reassign them first.`)
  }

  await prisma.department.delete({ where: { id } })
}
