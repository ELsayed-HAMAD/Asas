import type { PrismaClient } from '@prisma/client'
import type { Department, DepartmentWriteInput } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

export async function listDepartments(prisma: PrismaClient, tenantId: string): Promise<Department[]> {
  const departments = await prisma.department.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
  return departments.map(department => ({
    id: department.id,
    name: department.name,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  }))
}

export async function createDepartment(
  prisma: PrismaClient,
  tenantId: string,
  input: DepartmentWriteInput,
): Promise<Department> {
  const existing = await prisma.department.findFirst({ where: { tenantId, name: input.name } })
  if (existing) throw new AppError(409, 'A department with this name already exists')

  const department = await prisma.department.create({ data: { tenantId, name: input.name } })
  return {
    id: department.id,
    name: department.name,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  }
}
