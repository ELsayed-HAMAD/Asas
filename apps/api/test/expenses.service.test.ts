import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { listExpenses } from '../src/modules/finance/finance.service.js'

describe('listExpenses', () => {
  it('applies tenant-scoped department/search filters to rows and pagination counts, with requested sort', async () => {
    const date = new Date('2026-10-01T00:00:00.000Z')
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
      expense: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([{
          id: 'expense_1', employeeId: 'employee_1', name: 'Taxi', category: 'TRAVEL', merchant: 'Cab Co', date,
          amount: new Prisma.Decimal('12.50'), tax: null, policyMatch: null, status: 'PENDING', createdAt: date, updatedAt: date,
          employee: { name: 'Alex' },
        }]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaClient

    const result = await listExpenses(prisma, 'tenant_1', {
      page: 1, limit: 10, search: 'Taxi', departmentId: 'department_1', sort: 'asc',
    })

    const filteredWhere = {
      tenantId: 'tenant_1',
      employee: { is: { tenantId: 'tenant_1', departmentId: 'department_1' } },
      OR: [
        { name: { contains: 'Taxi', mode: 'insensitive' } },
        { merchant: { contains: 'Taxi', mode: 'insensitive' } },
      ],
    }
    expect(prisma.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: filteredWhere, orderBy: { date: 'asc' } }))
    expect(prisma.expense.count).toHaveBeenCalledWith({ where: filteredWhere })
    expect(result.items[0].amount).toEqual({ amount: 1250, currency: 'USD' })
  })
})
