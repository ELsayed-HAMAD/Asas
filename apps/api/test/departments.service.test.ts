import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { AppError } from '../src/utils/errors.js'
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from '../src/modules/hr/departments.service.js'

function stubPrisma(overrides: {
  findMany?: unknown[]
  findFirst?: unknown | null
  create?: unknown
  update?: unknown
  delete?: unknown
  countEmployees?: number
}) {
  return {
    department: {
      findMany: async () => overrides.findMany ?? [],
      findFirst: async () => overrides.findFirst ?? null,
      create: async () => overrides.create,
      update: async () => overrides.update,
      delete: async () => overrides.delete,
    },
    employee: {
      count: async () => overrides.countEmployees ?? 0,
    },
  } as unknown as PrismaClient
}

const now = new Date('2026-01-01T00:00:00.000Z')

describe('listDepartments', () => {
  it('maps rows to ISO timestamps', async () => {
    const prisma = stubPrisma({ findMany: [{ id: 'dept_1', name: 'Engineering', createdAt: now, updatedAt: now }] })
    const departments = await listDepartments(prisma, 'tenant_1')
    expect(departments).toEqual([
      { id: 'dept_1', name: 'Engineering', createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ])
  })
})

describe('createDepartment', () => {
  it('rejects a duplicate name within the tenant', async () => {
    const prisma = stubPrisma({ findFirst: { id: 'dept_1', name: 'Engineering' } })
    await expect(createDepartment(prisma, 'tenant_1', { name: 'Engineering' })).rejects.toThrow(AppError)
  })

  it('creates and maps the department when the name is free', async () => {
    const prisma = stubPrisma({
      findFirst: null,
      create: { id: 'dept_2', name: 'Sales', createdAt: now, updatedAt: now },
    })
    const department = await createDepartment(prisma, 'tenant_1', { name: 'Sales' })
    expect(department).toEqual({ id: 'dept_2', name: 'Sales', createdAt: now.toISOString(), updatedAt: now.toISOString() })
  })
})

describe('updateDepartment', () => {
  it('rejects update if department does not exist', async () => {
    const prisma = stubPrisma({ findFirst: null })
    await expect(updateDepartment(prisma, 'tenant_1', 'dept_x', { name: 'New Name' })).rejects.toThrow(AppError)
  })

  it('rejects duplicate name when renaming to an existing department name', async () => {
    let callCount = 0
    const prisma = {
      department: {
        findFirst: async () => {
          callCount++
          if (callCount === 1) return { id: 'dept_1', name: 'Engineering' }
          return { id: 'dept_2', name: 'Sales' }
        },
      },
    } as unknown as PrismaClient
    await expect(updateDepartment(prisma, 'tenant_1', 'dept_1', { name: 'Sales' })).rejects.toThrow(AppError)
  })

  it('updates and maps the department when valid', async () => {
    let callCount = 0
    const prisma = {
      department: {
        findFirst: async () => {
          callCount++
          if (callCount === 1) return { id: 'dept_1', name: 'Engineering' }
          return null
        },
        update: async () => ({ id: 'dept_1', name: 'Platform Engineering', createdAt: now, updatedAt: now }),
      },
    } as unknown as PrismaClient
    const department = await updateDepartment(prisma, 'tenant_1', 'dept_1', { name: 'Platform Engineering' })
    expect(department).toEqual({
      id: 'dept_1',
      name: 'Platform Engineering',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
  })
})

describe('deleteDepartment', () => {
  it('rejects deletion if department does not exist', async () => {
    const prisma = stubPrisma({ findFirst: null })
    await expect(deleteDepartment(prisma, 'tenant_1', 'dept_x')).rejects.toThrow(AppError)
  })

  it('rejects deletion if active employees are assigned', async () => {
    const prisma = stubPrisma({
      findFirst: { id: 'dept_1', name: 'Engineering' },
      countEmployees: 3,
    })
    await expect(deleteDepartment(prisma, 'tenant_1', 'dept_1')).rejects.toThrow(
      'Cannot delete department with 3 active employee(s)',
    )
  })

  it('deletes department when no active employees exist', async () => {
    let deletedId = ''
    const prisma = {
      department: {
        findFirst: async () => ({ id: 'dept_1', name: 'Engineering' }),
        delete: async ({ where }: { where: { id: string } }) => {
          deletedId = where.id
        },
      },
      employee: {
        count: async () => 0,
      },
    } as unknown as PrismaClient
    await deleteDepartment(prisma, 'tenant_1', 'dept_1')
    expect(deletedId).toBe('dept_1')
  })
})
