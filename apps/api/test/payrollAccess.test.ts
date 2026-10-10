import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { payrollRoutes } from '../src/modules/hr/payroll.routes.js'

const id = 'clxxxxxxxxxxxxxxxxxxxxxxx'
async function setup() {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'user_1' } }) } } as unknown as Auth)
  const payrollLine = { findFirst: vi.fn().mockResolvedValue({ employeeId: 'someone_else' }) }
  const payrollRun = { findFirst: vi.fn() }
  app.decorate('prisma', {
    member: { findUnique: async () => ({ role: 'MEMBER', employeeId: 'my_employee' }) },
    payrollLine, payrollRun,
  } as unknown as PrismaClient)
  await app.register(payrollRoutes)
  return { app, payrollLine, payrollRun }
}

describe('payroll salary access', () => {
  it('forbids member access to salary-bearing run lists and details', async () => {
    const { app, payrollRun } = await setup()
    try {
      expect((await app.inject(`/payroll/runs`)).statusCode).toBe(403)
      expect((await app.inject(`/payroll/runs/${id}`)).statusCode).toBe(403)
      expect(payrollRun.findFirst).not.toHaveBeenCalled()
    } finally { await app.close() }
  })
  it('forbids downloading another employee payslip before loading salary fields', async () => {
    const { app, payrollLine, payrollRun } = await setup()
    try {
      const response = await app.inject(`/payroll/runs/${id}/payslips/${id}`)
      expect(response.statusCode).toBe(403)
      expect(payrollLine.findFirst).toHaveBeenCalledWith({ where: { id, payrollRunId: id, tenantId: 'tenant_1' }, select: { employeeId: true } })
      expect(payrollRun.findFirst).not.toHaveBeenCalled()
    } finally { await app.close() }
  })
})
