import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { AppError } from '../src/utils/errors.js'
import { createDepartment, listDepartments } from '../src/modules/hr/departments.service.js'

function stubPrisma(overrides: {
  findMany?: unknown[]
  findFirst?: unknown | null
  create?: unknown
}) {
  return {
    department: {
      findMany: async () => overrides.findMany ?? [],
      findFirst: async () => overrides.findFirst ?? null,
      create: async () => overrides.create,
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
