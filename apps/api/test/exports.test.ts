import type { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'
import { exportJobCreateSchema } from '@asas/contracts'
import { describe, expect, it, vi } from 'vitest'
import { buildWorkspaceArchive, registerExportHandlers } from '../src/modules/exports/exports.routes.js'
import { renderEmployeeDirectoryCsv, renderLedgerCsv, renderLedgerXlsx, renderProjectsCsv, renderProjectsXlsx } from '../src/services/export.js'
import { exportContentType, exportFileExtension, exportFileName } from '../src/services/queue.js'

describe('exports', () => {
  it('registers employees, ledger, projects, and workspace handlers', () => {
    const handlers: Record<string, Function> = {}
    const queue = {
      register: vi.fn((kind, handler) => {
        handlers[kind] = handler
      }),
    }
    const prisma = {} as PrismaClient

    registerExportHandlers(queue, prisma)

    expect(queue.register).toHaveBeenCalledWith('employees', expect.any(Function))
    expect(queue.register).toHaveBeenCalledWith('ledger', expect.any(Function))
    expect(queue.register).toHaveBeenCalledWith('projects', expect.any(Function))
    expect(queue.register).toHaveBeenCalledWith('workspace', expect.any(Function))
  })

  it('renders projects xlsx buffer deterministically', async () => {
    const buffer = await renderProjectsXlsx([
      {
        name: 'Project Alpha',
        status: 'ACTIVE',
        department: 'Engineering',
        budget: '10000.00',
        spent: '2500.00',
        currency: 'USD',
        sprintsCount: 3,
      },
    ])

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('uses a matching media type for each supported file kind', () => {
    expect(exportContentType('workspace')).toBe('application/json; charset=utf-8')
    expect(exportContentType('employees')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(exportFileExtension('employees', 'csv')).toBe('csv')
    expect(exportFileName('employees', 'csv')).toBe('employees.csv')
    expect(exportContentType('employees', 'csv')).toBe('text/csv; charset=utf-8')
  })

  it('validates real report formats and complete inclusive date ranges', () => {
    expect(exportJobCreateSchema.safeParse({ kind: 'employees', format: 'csv', dateRange: { from: '2026-01-01', to: '2026-03-31' } }).success).toBe(true)
    expect(exportJobCreateSchema.safeParse({ kind: 'ledger', format: 'xlsx', dateRange: { from: '2026-02-01', to: '2026-02-01' } }).success).toBe(true)
    expect(exportJobCreateSchema.safeParse({ kind: 'employees', dateRange: '2026-Q1' }).success).toBe(false)
    expect(exportJobCreateSchema.safeParse({ kind: 'projects', dateRange: { from: '2026-03-01', to: '2026-02-01' } }).success).toBe(false)
    expect(exportJobCreateSchema.safeParse({ kind: 'workspace', format: 'csv' }).success).toBe(false)
    expect(exportJobCreateSchema.safeParse({ kind: 'workspace', dateRange: { from: '2026-01-01', to: '2026-01-31' } }).success).toBe(false)
    expect(exportJobCreateSchema.safeParse({ kind: 'employees', format: 'json' }).success).toBe(false)
    expect(exportJobCreateSchema.safeParse({ kind: 'employees' }).success).toBe(true)
  })

  it('renders formula-safe CSV with dates, amounts, and currency intact', () => {
    const employees = renderEmployeeDirectoryCsv([{
      name: '=HYPERLINK("https://bad.example")', title: 'Analyst', status: 'ACTIVE', department: null,
      location: null, email: 'ada@example.com', hiredAt: '2026-02-03', salary: '1234.50', currency: 'USD',
    }]).toString('utf8')
    expect(employees).toContain("'=HYPERLINK(\"\"https://bad.example\"\")")
    expect(employees).toContain('1234.50,USD')

    const ledger = renderLedgerCsv([{
      date: '2026-02-03', recordType: 'JOURNAL_LINE', journalId: 'journal_1', description: 'Invoice, AP-1',
      sourceType: 'AP_PAYMENT', accountCode: '1000', accountName: 'Cash', side: 'CREDIT', amount: '10.25',
      currency: 'USD', baseAmount: '10.25', baseCurrency: 'USD',
    }]).toString('utf8')
    expect(ledger).toContain('"Invoice, AP-1"')
    expect(ledger).toContain('JOURNAL_LINE,journal_1,"Invoice, AP-1",AP_PAYMENT,1000,Cash,CREDIT,10.25,USD,10.25,USD')

    const projects = renderProjectsCsv([{ name: 'Project Alpha', status: 'ACTIVE', department: null, budget: '100.00', spent: '20.00', currency: 'USD', sprintsCount: 2 }]).toString('utf8')
    expect(projects).toContain('Project Alpha,ACTIVE,,100.00,20.00,USD,2')
  })

  it('renders journal-line account detail and currency-safe debit/credit totals in XLSX', async () => {
    const buffer = await renderLedgerXlsx([
      {
        date: '2026-02-03', recordType: 'JOURNAL_LINE', journalId: 'journal_1', description: 'Cash receipt',
        sourceType: 'AR_PAYMENT', accountCode: '1000', accountName: 'Cash', side: 'DEBIT', amount: '50.00',
        currency: 'USD', baseAmount: '50.00', baseCurrency: 'USD',
      },
      {
        date: '2026-02-03', recordType: 'JOURNAL_LINE', journalId: 'journal_1', description: 'Cash receipt',
        sourceType: 'AR_PAYMENT', accountCode: '1200', accountName: 'Receivables', side: 'CREDIT', amount: '50.00',
        currency: 'USD', baseAmount: '50.00', baseCurrency: 'USD',
      },
    ])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    expect(workbook.getWorksheet('Ledger')?.getCell('F2').value).toBe('1000')
    expect(workbook.getWorksheet('Ledger')?.getCell('H2').value).toBe('DEBIT')
    expect(workbook.getWorksheet('Ledger')?.getCell('K2').value).toBe('50.00')
    expect(workbook.getWorksheet('Totals')?.getCell('C2').value).toBe('USD')
    expect(workbook.getWorksheet('Totals')?.getCell('D2').value).toContain('50')
    expect(workbook.getWorksheet('Totals')?.getCell('E2').value).toContain('50')
  })

  it('applies an inclusive employee hire-date window to the tenant query and returns CSV', async () => {
    const employeeFindMany = vi.fn().mockResolvedValue([{
      name: 'Ada', title: 'Engineer', status: 'ACTIVE', location: 'Cairo', email: 'ada@example.com',
      hiredAt: new Date('2026-02-15T12:00:00.000Z'), salary: { toString: () => '75000.25' },
      department: { name: 'Engineering' },
    }])
    const handlers: Record<string, Function> = {}
    registerExportHandlers({ register: (kind, handler) => { handlers[kind] = handler } }, {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'EGP' }) },
      employee: { findMany: employeeFindMany },
      exportJob: { findUnique: vi.fn().mockResolvedValue({ tenantId: 'tenant_1' }) },
    } as unknown as PrismaClient)

    const buffer = await handlers.employees!({
      canReadSalary: true,
      format: 'csv',
      dateRange: { from: '2026-02-01', to: '2026-02-28' },
    }, { jobId: 'job_1' }) as Buffer

    expect(employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant_1',
        status: { not: 'ARCHIVED' },
        hiredAt: { gte: new Date('2026-02-01T00:00:00.000Z'), lt: new Date('2026-03-01T00:00:00.000Z') },
      },
    }))
    expect(buffer.toString('utf8')).toContain('Ada,Engineer,ACTIVE,Engineering,Cairo,ada@example.com,2026-02-15,75000.25,EGP')
  })

  it('applies posting-date windows to the journal query', async () => {
    const journalFindMany = vi.fn().mockResolvedValue([{
      id: 'journal_1', postedAt: new Date('2026-02-28T23:59:00.000Z'), description: 'Closing entry', sourceType: 'MANUAL',
      amount: { toString: () => '50.00' }, baseAmount: { toString: () => '50.00' },
      currency: 'USD', baseCurrency: 'USD', lines: [{
        side: 'DEBIT', amount: { toString: () => '50.00' }, baseAmount: { toString: () => '50.00' },
        account: { code: '1000', name: 'Cash' },
      }],
    }])
    const legacyFindMany = vi.fn().mockResolvedValue([{
      date: new Date('2026-02-15T00:00:00.000Z'), description: 'Sample cash receipt', status: 'CLEARED',
      amount: { toString: () => '12.00' }, currency: null, isCredit: true,
    }])
    const handlers: Record<string, Function> = {}
    registerExportHandlers({ register: (kind, handler) => { handlers[kind] = handler } }, {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
      journalEntry: { findMany: journalFindMany },
      ledgerTransaction: { findMany: legacyFindMany },
      exportJob: { findUnique: vi.fn().mockResolvedValue({ tenantId: 'tenant_1' }) },
    } as unknown as PrismaClient)

    const buffer = await handlers.ledger!({ format: 'csv', dateRange: { from: '2026-02-01', to: '2026-02-28' } }, { jobId: 'job_1' }) as Buffer

    expect(journalFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant_1',
        postedAt: { gte: new Date('2026-02-01T00:00:00.000Z'), lt: new Date('2026-03-01T00:00:00.000Z') },
      },
    }))
    expect(buffer.toString('utf8')).toContain('JOURNAL_LINE,journal_1,Closing entry,MANUAL,1000,Cash,DEBIT,50.00,USD,50.00,USD')
    expect(buffer.toString('utf8')).toContain('LEGACY_TRANSACTION,,Sample cash receipt,CLEARED,,,CREDIT,12.00,USD,,')
    expect(legacyFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant_1', date: { gte: new Date('2026-02-01T00:00:00.000Z'), lt: new Date('2026-03-01T00:00:00.000Z') } },
    }))
  })

  it('filters projects by creation date rather than an unrelated timeline field', async () => {
    const projectFindMany = vi.fn().mockResolvedValue([])
    const handlers: Record<string, Function> = {}
    registerExportHandlers({ register: (kind, handler) => { handlers[kind] = handler } }, {
      tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
      project: { findMany: projectFindMany },
      exportJob: { findUnique: vi.fn().mockResolvedValue({ tenantId: 'tenant_1' }) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaClient)

    await handlers.projects!({ format: 'csv', dateRange: { from: '2026-02-01', to: '2026-02-28' } }, { jobId: 'job_1' })

    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant_1',
        createdAt: { gte: new Date('2026-02-01T00:00:00.000Z'), lt: new Date('2026-03-01T00:00:00.000Z') },
      },
    }))
  })

  it('exports all tenant-scoped models and dependent records while omitting secrets', async () => {
    const calls = new Map<string, Array<{ where: Record<string, unknown>; select: Record<string, boolean> }>>()
    const fixtures: Record<string, Record<string, unknown>[]> = {
      deal: [{ id: 'deal_1', tenantId: 'tenant_1', name: 'Tenant deal' }],
      stockMovement: [{ id: 'movement_1', tenantId: 'tenant_1', delta: 4 }],
      auditLog: [{ id: 'audit_1', tenantId: 'tenant_1', metadata: { action: 'workspace.update', apiToken: 'must-not-export' } }],
      issueComment: [{ id: 'comment_1', issueId: 'issue_1', body: 'Project note' }],
      integration: [{ id: 'integration_1', tenantId: 'tenant_1', status: 'CONFIGURE', credential: 'https://secret.example/path' }],
      employee: [{ id: 'employee_1', tenantId: 'tenant_1', name: 'Ada', bankRoutingNumber: '021000021', bankAccountNumber: '1234567890', bankIban: 'DE89370400440532013000', bankBic: 'DEUTDEFF' }],
    }
    const tx = new Proxy({
      tenant: { findUnique: vi.fn().mockResolvedValue({ id: 'tenant_1', name: 'Acme', stripeCustomerId: 'cus_123' }) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'user_1', name: 'Owner', email: 'owner@example.com' }]) },
    }, {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) return Reflect.get(target, property, receiver)
        if (typeof property !== 'string') return undefined
        return {
          findMany: vi.fn(async (args: { where: Record<string, unknown>; select: Record<string, boolean> }) => {
            calls.set(property, [...(calls.get(property) ?? []), args])
            return (fixtures[property] ?? []).map(record => Object.fromEntries(
              Object.entries(record).filter(([field]) => args.select[field]),
            ))
          }),
        }
      },
    })
    const prisma = {
      $transaction: vi.fn(async (callback: (client: unknown) => Promise<unknown>, options: unknown) => {
        expect(options).toMatchObject({ isolationLevel: 'RepeatableRead' })
        return callback(tx)
      }),
    } as unknown as PrismaClient

    const buffer = await buildWorkspaceArchive(prisma, 'tenant_1')
    const archive = JSON.parse(buffer.toString('utf8'))

    expect(archive.metadata.version).toBe('2.0.0')
    expect(archive.data.Deal).toEqual(fixtures.deal)
    expect(archive.data.StockMovement).toEqual(fixtures.stockMovement)
    expect(archive.data.AuditLog).toEqual([{ id: 'audit_1', tenantId: 'tenant_1', metadata: { action: 'workspace.update' } }])
    expect(archive.data.IssueComment).toEqual(fixtures.issueComment)
    expect(archive.data.UserIdentity).toEqual([{ id: 'user_1', name: 'Owner', email: 'owner@example.com' }])
    expect(archive.data.Integration).toEqual([{ id: 'integration_1', tenantId: 'tenant_1', status: 'CONFIGURE' }])
    expect(archive.data.Employee).toEqual([{ id: 'employee_1', tenantId: 'tenant_1', name: 'Ada' }])
    expect(calls.get('deal')?.[0]?.where).toEqual({ tenantId: 'tenant_1' })
    expect(calls.get('issueComment')?.[0]?.where).toEqual({ issue: { tenantId: 'tenant_1' } })
    expect(calls.get('productSupplier')?.[0]?.where).toEqual({
      AND: [{ product: { tenantId: 'tenant_1' } }, { supplier: { tenantId: 'tenant_1' } }],
    })
    expect(calls.get('integration')?.[0]?.select.credential).toBeUndefined()
    expect(calls.get('employee')?.[0]?.select.bankAccountNumber).toBeUndefined()
    expect(JSON.stringify(archive)).not.toContain('https://secret.example/path')
    expect(JSON.stringify(archive)).not.toContain('021000021')
    expect(JSON.stringify(archive)).not.toContain('DE89370400440532013000')
    expect(archive.metadata.modelCounts.Deal).toBe(1)
  })
})
