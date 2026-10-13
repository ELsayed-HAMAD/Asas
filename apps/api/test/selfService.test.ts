import { afterEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()))
})

function stubAuth(sessionData: { session: { activeOrganizationId: string | null }; user: { id: string } } | null) {
  return { api: { getSession: async () => sessionData } } as any
}

const cuid1 = 'cly0000000000000000000001'
const cuid2 = 'cly0000000000000000000002'

function stubPrisma(options: { memberData?: { role: 'OWNER' | 'ADMIN' | 'MEMBER'; employeeId: string | null }; overrides?: Record<string, unknown> } = {}) {
  const memberData = options.memberData ?? { role: 'MEMBER', employeeId: cuid2 }
  return {
    $connect: async () => {},
    $disconnect: async () => {},
    member: { findUnique: async () => memberData },
    tenant: { findUnique: async () => ({ id: 'tenant_1', currency: 'USD', timezone: 'UTC' }) },
    employee: { findFirst: async () => ({ id: cuid2, tenantId: 'tenant_1' }) },
    ...options.overrides,
  } as any
}

describe('Employee Self-Service & Separation of Duties', () => {
  describe('GET /payroll/my-payslips', () => {
    it('returns 409 when member account is not linked to an employee record', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const prisma = stubPrisma({ memberData: { role: 'MEMBER', employeeId: null } })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({ method: 'GET', url: '/api/v1/hr/payroll/my-payslips' })
      expect(response.statusCode).toBe(409)
      expect(response.json().error.message).toBe('Link this account to an employee record to view payslips')
    })

    it('returns the caller employee payslips formatted correctly', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const mockLines = [
        {
          id: cuid1,
          payrollRunId: cuid2,
          employeeId: 'emp_123',
          baseSalary: new Prisma.Decimal('5000'),
          gross: new Prisma.Decimal('5000'),
          deductions: new Prisma.Decimal('500'),
          net: new Prisma.Decimal('4500'),
          createdAt: new Date('2026-10-10T12:00:00Z'),
          payrollRun: {
            id: cuid2,
            label: 'October 2026',
            periodStart: new Date('2026-10-01'),
            periodEnd: new Date('2026-10-31'),
            payDate: new Date('2026-11-01'),
            status: 'APPROVED',
            currency: 'USD',
          },
        },
      ]
      const prisma = stubPrisma({
        overrides: {
          payrollLine: {
            findMany: vi.fn(async () => mockLines),
          },
        },
      })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({ method: 'GET', url: '/api/v1/hr/payroll/my-payslips' })
      expect(response.statusCode).toBe(200)
      const json = response.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0]).toMatchObject({
        id: cuid1,
        payrollRunId: cuid2,
        runLabel: 'October 2026',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        payDate: '2026-11-01',
        status: 'APPROVED',
        currency: 'USD',
        baseSalary: '5000',
        gross: '5000',
        deductions: '500',
        net: '4500',
      })
    })
  })

  describe('POST /finance/expenses/self', () => {
    it('returns 409 when submitting self expense without an employee record linked', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const prisma = stubPrisma({ memberData: { role: 'MEMBER', employeeId: null } })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/finance/expenses/self',
        payload: {
          name: 'Client lunch',
          date: '2026-10-12',
          amount: '45.00',
          category: 'MEALS',
        },
      })
      expect(response.statusCode).toBe(409)
      expect(response.json().error.message).toBe('Link this account to an employee record before submitting expenses')
    })

    it('creates expense with caller employeeId bound and records self-service audit log', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const mockCreatedExpense = {
        id: cuid1,
        tenantId: 'tenant_1',
        projectId: null,
        employeeId: cuid2,
        name: 'Client lunch',
        category: 'MEALS',
        merchant: null,
        date: new Date('2026-10-12'),
        amount: new Prisma.Decimal('45.00'),
        tax: null,
        policyMatch: null,
        status: 'PENDING',
        reimbursedAt: null,
        reimbursedById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        voidedAt: null,
        voidedById: null,
        voidReason: null,
        employee: { name: 'Test Employee' },
      }

      let auditEntry: any = null
      const prisma = stubPrisma({
        overrides: {
          $transaction: async (fn: any) => fn(prisma),
          expense: {
            create: vi.fn(async ({ data }: any) => {
              expect(data.employeeId).toBe(cuid2)
              return mockCreatedExpense
            }),
          },
          auditLog: {
            create: vi.fn(async ({ data }: any) => {
              auditEntry = data
              return { id: 'audit_1', ...data }
            }),
          },
        },
      })

      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/finance/expenses/self',
        payload: {
          name: 'Client lunch',
          date: '2026-10-12',
          amount: '45.00',
          category: 'MEALS',
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().data.id).toBe(cuid1)
      expect(auditEntry.action).toBe('finance.expense.create')
      expect(JSON.parse(auditEntry.metadata)).toMatchObject({ selfService: true })
    })
  })

  describe('Separation of Duties guards', () => {
    it('forbids a MEMBER from approving a payable invoice (403)', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const prisma = stubPrisma({ memberData: { role: 'MEMBER', employeeId: 'emp_123' } })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/finance/payables/${cuid1}/status`,
        payload: { status: 'APPROVED' },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.message).toContain("Requires the 'ADMIN' role")
    })

    it('forbids a MEMBER from paying a payable invoice (403)', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const prisma = stubPrisma({ memberData: { role: 'MEMBER', employeeId: 'emp_123' } })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/finance/payables/${cuid1}/status`,
        payload: { status: 'PAID' },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.message).toContain("Requires the 'ADMIN' role")
    })

    it('forbids a MEMBER from batch paying payable invoices (403)', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const prisma = stubPrisma({ memberData: { role: 'MEMBER', employeeId: 'emp_123' } })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/finance/payables/batch-payment',
        payload: { ids: [cuid1] },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.message).toContain("Requires the 'ADMIN' role")
    })

    it('forbids a MEMBER from voiding a payable invoice (403)', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const prisma = stubPrisma({ memberData: { role: 'MEMBER', employeeId: 'emp_123' } })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/finance/payables/${cuid1}/void`,
        payload: { reason: 'Incorrect vendor' },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.message).toContain("Requires the 'ADMIN' role")
    })

    it('forbids a MEMBER from approving an expense (403)', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const prisma = stubPrisma({ memberData: { role: 'MEMBER', employeeId: 'emp_123' } })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/finance/expenses/${cuid1}/status`,
        payload: { status: 'APPROVED' },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.message).toContain("Requires the 'ADMIN' role")
    })

    it('forbids a MEMBER from marking an expense reimbursed (403)', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const prisma = stubPrisma({ memberData: { role: 'MEMBER', employeeId: 'emp_123' } })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/finance/expenses/${cuid1}/status`,
        payload: { status: 'REIMBURSED' },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.message).toContain("Requires the 'ADMIN' role")
    })

    it('forbids a MEMBER from voiding an expense (403)', async () => {
      const auth = stubAuth({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } })
      const prisma = stubPrisma({ memberData: { role: 'MEMBER', employeeId: 'emp_123' } })
      const app = await buildApp(loadEnv(), { logger: false, prisma, auth })
      apps.push(app)

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/finance/expenses/${cuid1}/void`,
        payload: { reason: 'Mistake' },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json().error.message).toContain("Requires the 'ADMIN' role")
    })
  })
})
