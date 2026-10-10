import type { Prisma, PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { captureSampleManifest, clearSamplePack, importEmployees } from '../src/modules/onboarding/samplePack.service.js'

async function setup(extraData: Record<string, Array<{ id: string; [key: string]: unknown }>> = {}) {
  const data: Record<string, Array<{ id: string; [key: string]: unknown }>> = {
    product: [{ id: 'sample_product', tenantId: 'tenant_1', stock: 10, suppliers: [] }],
    ...extraData,
  }
  const deletes: Record<string, ReturnType<typeof vi.fn>> = {}
  const tenant = { id: 'tenant_1', onboardingStatus: 'SAMPLE_LOADED', sampleDataManifest: null as unknown }
  const base = {
    tenant: { findUnique: vi.fn(async () => tenant), update: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'tenant_1' }]),
  }
  const tx = new Proxy(base, {
    get(target, property: string) {
      if (property in target) return target[property as keyof typeof target]
      deletes[property] ??= vi.fn(async () => ({ count: data[property]?.length ?? 0 }))
      return { findMany: async () => data[property] ?? [], deleteMany: deletes[property] }
    },
  }) as unknown as Prisma.TransactionClient
  tenant.sampleDataManifest = await captureSampleManifest(tx, 'tenant_1')
  const prisma = { $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)) } as unknown as PrismaClient
  return { prisma, tenant, data, deletes }
}

describe('sample-data clearing safety', () => {
  it('resolves import currency only after claiming the tenant in the same transaction', async () => {
    const events: string[] = []
    const create = vi.fn(async () => { events.push('employee') })
    const outsideRead = vi.fn().mockResolvedValue({ currency: 'USD' })
    const tx = {
      tenant: {
        updateMany: async () => { events.push('claim'); return { count: 1 } },
        findUnique: async () => { events.push('currency'); return { currency: 'KWD' } },
        update: async () => ({}),
      },
      employee: { create },
    }
    const prisma = { tenant: { findUnique: outsideRead }, $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(tx) } as unknown as PrismaClient
    await expect(importEmployees(prisma, 'tenant_1', { employees: [{ name: 'Ada', title: 'Engineer', salary: '10.123' }] })).resolves.toEqual({ imported: 1 })
    expect(events).toEqual(['claim', 'currency', 'employee'])
    expect(outsideRead).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ salary: '10.123' }) }))
  })
  const currencyModels = ['employee', 'payableInvoice', 'receivableInvoice', 'expense', 'ledgerTransaction', 'cashFlowSnapshot', 'deal', 'salesQuota', 'forecastSnapshot', 'product', 'project']
  it.each(currencyModels)('preserves old %s provenance when currency metadata is null', async model => {
    const { prisma, data } = await setup({ [model]: [{ id: `sample_${model}`, tenantId: 'tenant_1', amount: '10' }] })
    data[model][0].currency = null
    await expect(clearSamplePack(prisma, 'tenant_1')).resolves.toMatchObject({ onboardingStatus: 'PENDING' })
  })
  it.each(currencyModels)('blocks clearing after %s currency provenance changes', async model => {
    const { prisma, data, deletes } = await setup({ [model]: [{ id: `sample_${model}`, tenantId: 'tenant_1', amount: '10' }] })
    data[model][0].currency = 'USD'
    await expect(clearSamplePack(prisma, 'tenant_1')).rejects.toThrow('Business data has changed')
    expect(Object.values(deletes).every(fn => fn.mock.calls.length === 0)).toBe(true)
  })
  it('retains pre-CRM-migration provenance for null closure and empty history', async () => {
    const { prisma, data } = await setup({ deal: [{ id: 'sample_deal', tenantId: 'tenant_1', stage: 'CLOSED_WON', activities: [] }] })
    Object.assign(data.deal[0], { closedAt: null, stageHistory: [] })
    await expect(clearSamplePack(prisma, 'tenant_1')).resolves.toMatchObject({ onboardingStatus: 'PENDING' })
  })
  it.each(['closedAt', 'stageHistory'])('blocks clearing after real CRM %s is recorded', async field => {
    const { prisma, data, deletes } = await setup({ deal: [{ id: 'sample_deal', tenantId: 'tenant_1', stage: 'LEADS', activities: [] }] })
    data.deal[0][field] = field === 'closedAt' ? '2026-10-07T00:00:00Z' : [{ id: 'real_move', fromStage: 'LEADS', toStage: 'PROPOSAL' }]
    await expect(clearSamplePack(prisma, 'tenant_1')).rejects.toThrow('Business data has changed')
    expect(Object.values(deletes).every(fn => fn.mock.calls.length === 0)).toBe(true)
  })
  it('retains pre-migration provenance when new payroll fields are null', async () => {
    const { prisma, data } = await setup({
      employee: [{ id: 'sample_employee', tenantId: 'tenant_1', salary: '120000' }],
      payrollRun: [{ id: 'sample_run', tenantId: 'tenant_1', label: 'Legacy payroll' }],
      payrollLine: [{ id: 'sample_line', tenantId: 'tenant_1', gross: '10000' }],
    })
    Object.assign(data.employee[0], { salaryBasis: null })
    Object.assign(data.payrollRun[0], { periodStart: null, periodEnd: null, payFrequency: null, periodsPerYear: null, salaryBasis: null, prorationMethod: null, currency: null, requestKey: null, requestHash: null })
    Object.assign(data.payrollLine[0], { sourceSalary: null, salaryBasis: null, eligibleDays: null, periodDays: null })
    await expect(clearSamplePack(prisma, 'tenant_1')).resolves.toMatchObject({ onboardingStatus: 'PENDING' })
  })
  it('still refuses clearing when newly added payroll metadata is changed', async () => {
    const { prisma, data, deletes } = await setup({ employee: [{ id: 'sample_employee', tenantId: 'tenant_1', salary: '120000' }] })
    data.employee[0].salaryBasis = 'ANNUAL'
    await expect(clearSamplePack(prisma, 'tenant_1')).rejects.toThrow('Business data has changed')
    expect(Object.values(deletes).every(fn => fn.mock.calls.length === 0)).toBe(true)
  })
  it('deletes only provenance-recorded IDs and retains workspace identity', async () => {
    const { prisma, deletes } = await setup()
    const result = await clearSamplePack(prisma, 'tenant_1')
    expect(result.onboardingStatus).toBe('PENDING')
    expect(deletes.product).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1', id: { in: ['sample_product'] } } })
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 300000, isolationLevel: 'Serializable' })
  })
  it('refuses legacy samples with unknown provenance', async () => {
    const { prisma, tenant, deletes } = await setup()
    tenant.sampleDataManifest = null
    await expect(clearSamplePack(prisma, 'tenant_1')).rejects.toMatchObject({ statusCode: 409 })
    expect(Object.values(deletes).every(fn => fn.mock.calls.length === 0)).toBe(true)
  })
  it('refuses clearing after real records are added', async () => {
    const { prisma, data, deletes } = await setup()
    data.product.push({ id: 'real_product', stock: 100 })
    await expect(clearSamplePack(prisma, 'tenant_1')).rejects.toThrow('Business data has changed')
    expect(Object.values(deletes).every(fn => fn.mock.calls.length === 0)).toBe(true)
  })
  it('refuses clearing after sample records or cascading children are edited', async () => {
    const { prisma, data, deletes } = await setup()
    data.product[0].suppliers = [{ id: 'real_supplier_link' }]
    await expect(clearSamplePack(prisma, 'tenant_1')).rejects.toThrow('Business data has changed')
    expect(Object.values(deletes).every(fn => fn.mock.calls.length === 0)).toBe(true)
  })
})
