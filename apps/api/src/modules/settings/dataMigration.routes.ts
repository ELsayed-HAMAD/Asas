import {
  dataMigrationProjectCreateSchema,
  dataMigrationProjectSchema,
  dataMigrationProjectsResponseSchema,
  dataMigrationProjectUpdateSchema,
  crmCompanyImportRequestSchema,
  crmCompanyImportResponseSchema,
  crmCompanyImportValidationSchema,
  crmDealImportRequestSchema,
  crmDealImportResponseSchema,
  crmDealImportValidationSchema,
  inventoryProductImportRequestSchema,
  inventoryProductImportResponseSchema,
  inventoryProductImportValidationSchema,
  inventoryOpeningStockImportRequestSchema,
  inventoryOpeningStockImportResponseSchema,
  inventoryOpeningStockImportValidationSchema,
  inventorySupplierImportRequestSchema,
  inventorySupplierImportResponseSchema,
  inventorySupplierImportValidationSchema,
  inventoryProductSupplierImportRequestSchema,
  inventoryProductSupplierImportResponseSchema,
  inventoryProductSupplierImportValidationSchema,
  financeCustomerImportRequestSchema,
  financeCounterpartyImportResponseSchema,
  financeCounterpartyImportValidationSchema,
  financeVendorImportRequestSchema,
  projectPortfolioImportRequestSchema,
  projectPortfolioImportResponseSchema,
  projectPortfolioImportValidationSchema,
  financeApOpenItemsRequestSchema,
  financeArOpenItemsRequestSchema,
  financeOpeningBalanceRequestSchema,
  financeStageResponseSchema,
  financeStageValidationSchema,
  financeReconciliationSchema,
  financeStageRecordsQuerySchema,
  financeStageRecordsResponseSchema,
  financeCutoverRequestSchema,
  financeCutoverResponseSchema,
  envelope,
  errorResponses,
  idParamSchema,
} from '@asas/contracts'
import type { DataMigrationEntity, DataMigrationModule } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { requireAuthContext, requireRole } from '../../middlewares/rbac.js'
import { requirePermission } from '../../middlewares/permissions.js'
import { moduleKeyPrefix } from '../../plugins/sse.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'
import { importCrmCompanies, validateCrmCompanyImport } from './crmCompanyMigration.service.js'
import { importCrmDeals, validateCrmDealImport } from './crmDealMigration.service.js'
import { importInventoryProducts, validateInventoryProductImport } from './inventoryProductMigration.service.js'
import { importInventoryOpeningStock, validateInventoryOpeningStockImport } from './inventoryOpeningStockMigration.service.js'
import { importInventoryProductSuppliers, importInventorySuppliers, validateInventoryProductSupplierImport, validateInventorySupplierImport } from './inventorySupplierMigration.service.js'
import { importFinanceCounterparties, validateFinanceCounterpartyImport } from './financeCounterpartyMigration.service.js'
import { importProjectPortfolio, validateProjectPortfolioImport } from './projectPortfolioMigration.service.js'
import { listFinanceMigrationStageRecords, previewFinanceMigrationReconciliation, stageFinanceMigrationBatch, validateFinanceMigrationStage } from './financeMigrationStaging.service.js'
import { cutoverFinanceMigration } from './financeMigrationCutover.service.js'

function toProjectDto(project: {
  id: string
  name: string
  sourceSystem: string | null
  modules: DataMigrationModule[]
  status: 'PLANNING' | 'IN_PROGRESS' | 'RECONCILING' | 'READY_FOR_CUTOVER' | 'COMPLETED' | 'PAUSED'
  targetCutoverAt: Date | null
  createdAt: Date
  updatedAt: Date
  jobs?: { id: string; entity: DataMigrationEntity; status: 'COMPLETED'; totalRows: number; importedRows: number; createdAt: Date; completedAt: Date }[]
  stageBatches?: { id: string; entity: DataMigrationEntity; sequence: number; status: 'STAGED' | 'COMPLETED'; totalRows: number; stagedRows: number; createdAt: Date }[]
}) {
  return {
    id: project.id,
    name: project.name,
    sourceSystem: project.sourceSystem,
    modules: project.modules,
    status: project.status,
    targetCutoverAt: project.targetCutoverAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    jobs: project.jobs?.map(job => ({
      id: job.id,
      entity: job.entity,
      status: job.status,
      totalRows: job.totalRows,
      importedRows: job.importedRows,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt.toISOString(),
    })) ?? [],
    stagedBatches: project.stageBatches?.map(batch => ({ id: batch.id, entity: batch.entity, status: batch.status, sequence: batch.sequence, totalRows: batch.totalRows, stagedRows: batch.stagedRows, createdAt: batch.createdAt.toISOString() })) ?? [],
  }
}

/** Persistent company migration projects managed from onboarding and Settings. */
export async function dataMigrationRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get('/', {
    preHandler: requireRole('MEMBER'),
    schema: { response: { 200: envelope(dataMigrationProjectsResponseSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    const projects = await request.server.prisma.dataMigrationProject.findMany({
      where: { tenantId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: { jobs: { orderBy: { createdAt: 'desc' } }, stageBatches: { orderBy: { createdAt: 'desc' } } },
    })
    return { data: { projects: projects.map(toProjectDto) } }
  })

  server.post('/', {
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: {
      body: dataMigrationProjectCreateSchema,
      response: { 201: envelope(dataMigrationProjectSchema), ...errorResponses },
    },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const project = await request.server.prisma.$transaction(async tx => {
      const created = await tx.dataMigrationProject.create({
        data: {
          tenantId,
          createdBy: userId,
          name: request.body.name,
          sourceSystem: request.body.sourceSystem ?? null,
          modules: request.body.modules as DataMigrationModule[],
          targetCutoverAt: request.body.targetCutoverAt ? new Date(request.body.targetCutoverAt) : null,
        },
      })
      await recordAuditLog(tx, {
        tenantId,
        actorId: userId,
        action: 'dataMigration.project.create',
        targetType: 'DataMigrationProject',
        targetId: created.id,
        metadata: { modules: created.modules, sourceSystem: created.sourceSystem },
      })
      return created
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
    reply.code(201)
    return { data: toProjectDto(project) }
  })

  server.patch('/:id', {
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: {
      params: idParamSchema,
      body: dataMigrationProjectUpdateSchema,
      response: { 200: envelope(dataMigrationProjectSchema), ...errorResponses },
    },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const existing = await request.server.prisma.dataMigrationProject.findFirst({
      where: { id: request.params.id, tenantId },
      select: { id: true, status: true },
    })
    if (!existing) throw new AppError(404, 'Migration project not found')
    if (!['PLANNING', 'IN_PROGRESS', 'PAUSED'].includes(existing.status)) throw new AppError(409, 'This migration project can no longer be edited')

    const patch = request.body
    if (!Object.keys(patch).length) throw new AppError(400, 'Provide at least one project field to update')
    const project = await request.server.prisma.$transaction(async tx => {
      const completedFinanceBatch = await tx.dataMigrationStageBatch.findFirst({ where: { tenantId, projectId: existing.id, entity: { in: ['FINANCE_AP_OPEN_ITEMS', 'FINANCE_AR_OPEN_ITEMS', 'FINANCE_OPENING_BALANCE'] }, status: 'COMPLETED' }, select: { id: true } })
      const existingCutoverDate = (await tx.dataMigrationProject.findUniqueOrThrow({ where: { id: existing.id }, select: { targetCutoverAt: true } })).targetCutoverAt?.toISOString().slice(0, 10) ?? null
      const requestedCutoverDate = patch.targetCutoverAt ? new Date(patch.targetCutoverAt).toISOString().slice(0, 10) : null
      if (completedFinanceBatch && (
        (patch.modules !== undefined && !patch.modules.includes('FINANCE'))
        || (patch.targetCutoverAt !== undefined && requestedCutoverDate !== existingCutoverDate)
        || patch.sourceSystem !== undefined
      )) throw new AppError(409, 'Finance cutover is complete; its source, date, and Finance project scope are locked. Start a new migration project for a new cutover.')
      const updated = await tx.dataMigrationProject.update({
        where: { id: existing.id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.sourceSystem !== undefined ? { sourceSystem: patch.sourceSystem } : {}),
          ...(patch.modules !== undefined ? { modules: patch.modules as DataMigrationModule[] } : {}),
          ...(patch.targetCutoverAt !== undefined ? { targetCutoverAt: patch.targetCutoverAt ? new Date(patch.targetCutoverAt) : null } : {}),
        },
      })
      await recordAuditLog(tx, {
        tenantId,
        actorId: userId,
        action: 'dataMigration.project.update',
        targetType: 'DataMigrationProject',
        targetId: updated.id,
        metadata: { changedFields: Object.keys(patch), modules: updated.modules },
      })
      return updated
    })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings')])
    return reply.send({ data: toProjectDto(project) })
  })

  server.post('/:id/crm/companies/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: {
      params: idParamSchema,
      body: crmCompanyImportRequestSchema,
      response: { 200: envelope(crmCompanyImportValidationSchema), ...errorResponses },
    },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    const result = await validateCrmCompanyImport(request.server.prisma, tenantId, request.params.id, request.body.companies)
    return { data: result }
  })

  server.post('/:id/crm/companies/import', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: {
      params: idParamSchema,
      body: crmCompanyImportRequestSchema,
      response: { 201: envelope(crmCompanyImportResponseSchema), ...errorResponses },
    },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await importCrmCompanies(request.server.prisma, tenantId, request.params.id, request.body.companies, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('crm')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/crm/deals/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: crmDealImportRequestSchema, response: { 200: envelope(crmDealImportValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateCrmDealImport(request.server.prisma, tenantId, request.params.id, request.body.deals) }
  })

  server.post('/:id/crm/deals/import', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: crmDealImportRequestSchema, response: { 201: envelope(crmDealImportResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await importCrmDeals(request.server.prisma, tenantId, request.params.id, request.body.deals, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('crm')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/inventory/products/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: inventoryProductImportRequestSchema, response: { 200: envelope(inventoryProductImportValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateInventoryProductImport(request.server.prisma, tenantId, request.params.id, request.body.products) }
  })

  server.post('/:id/inventory/products/import', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: inventoryProductImportRequestSchema, response: { 201: envelope(inventoryProductImportResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await importInventoryProducts(request.server.prisma, tenantId, request.params.id, request.body.products, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('inventory')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/inventory/opening-stock/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: inventoryOpeningStockImportRequestSchema, response: { 200: envelope(inventoryOpeningStockImportValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateInventoryOpeningStockImport(request.server.prisma, tenantId, request.params.id, request.body.stock) }
  })

  server.post('/:id/inventory/opening-stock/import', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: inventoryOpeningStockImportRequestSchema, response: { 201: envelope(inventoryOpeningStockImportResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await importInventoryOpeningStock(request.server.prisma, tenantId, request.params.id, request.body.stock, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('inventory'), moduleKeyPrefix('finance')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/inventory/suppliers/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: inventorySupplierImportRequestSchema, response: { 200: envelope(inventorySupplierImportValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateInventorySupplierImport(request.server.prisma, tenantId, request.params.id, request.body.suppliers) }
  })

  server.post('/:id/inventory/suppliers/import', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: inventorySupplierImportRequestSchema, response: { 201: envelope(inventorySupplierImportResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await importInventorySuppliers(request.server.prisma, tenantId, request.params.id, request.body.suppliers, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('inventory')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/inventory/product-suppliers/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: inventoryProductSupplierImportRequestSchema, response: { 200: envelope(inventoryProductSupplierImportValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateInventoryProductSupplierImport(request.server.prisma, tenantId, request.params.id, request.body.links) }
  })

  server.post('/:id/inventory/product-suppliers/import', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: inventoryProductSupplierImportRequestSchema, response: { 201: envelope(inventoryProductSupplierImportResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await importInventoryProductSuppliers(request.server.prisma, tenantId, request.params.id, request.body.links, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('inventory')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/finance/vendors/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeVendorImportRequestSchema, response: { 200: envelope(financeCounterpartyImportValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateFinanceCounterpartyImport(request.server.prisma, tenantId, request.params.id, 'FINANCE_VENDORS', request.body.vendors) }
  })

  server.post('/:id/finance/vendors/import', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeVendorImportRequestSchema, response: { 201: envelope(financeCounterpartyImportResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await importFinanceCounterparties(request.server.prisma, tenantId, request.params.id, 'FINANCE_VENDORS', request.body.vendors, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('finance')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/finance/customers/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeCustomerImportRequestSchema, response: { 200: envelope(financeCounterpartyImportValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateFinanceCounterpartyImport(request.server.prisma, tenantId, request.params.id, 'FINANCE_CUSTOMERS', request.body.customers) }
  })

  server.post('/:id/finance/customers/import', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeCustomerImportRequestSchema, response: { 201: envelope(financeCounterpartyImportResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await importFinanceCounterparties(request.server.prisma, tenantId, request.params.id, 'FINANCE_CUSTOMERS', request.body.customers, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('finance')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/finance/ap-open-items/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeApOpenItemsRequestSchema, response: { 200: envelope(financeStageValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateFinanceMigrationStage(request.server.prisma, tenantId, request.params.id, 'FINANCE_AP_OPEN_ITEMS', request.body.items) }
  })

  server.get('/:id/finance/reconciliation', {
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, response: { 200: envelope(financeReconciliationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await previewFinanceMigrationReconciliation(request.server.prisma, tenantId, request.params.id) }
  })

  server.post('/:id/finance/cutover', {
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeCutoverRequestSchema, response: { 200: envelope(financeCutoverResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await cutoverFinanceMigration(request.server.prisma, tenantId, request.params.id, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('finance')])
    return reply.send({ data: result })
  })

  server.get('/:id/finance/staged-records', {
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, querystring: financeStageRecordsQuerySchema, response: { 200: envelope(financeStageRecordsResponseSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    const { entity, page, limit } = request.query
    return { data: await listFinanceMigrationStageRecords(request.server.prisma, tenantId, request.params.id, entity, { page, limit }) }
  })

  server.post('/:id/finance/ap-open-items/stage', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeApOpenItemsRequestSchema, response: { 201: envelope(financeStageResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await stageFinanceMigrationBatch(request.server.prisma, tenantId, request.params.id, 'FINANCE_AP_OPEN_ITEMS', request.body.items, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('finance')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/finance/ar-open-items/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeArOpenItemsRequestSchema, response: { 200: envelope(financeStageValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateFinanceMigrationStage(request.server.prisma, tenantId, request.params.id, 'FINANCE_AR_OPEN_ITEMS', request.body.items) }
  })

  server.post('/:id/finance/ar-open-items/stage', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeArOpenItemsRequestSchema, response: { 201: envelope(financeStageResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await stageFinanceMigrationBatch(request.server.prisma, tenantId, request.params.id, 'FINANCE_AR_OPEN_ITEMS', request.body.items, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('finance')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/finance/opening-balance/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeOpeningBalanceRequestSchema, response: { 200: envelope(financeStageValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    const { asOf, accountsReceivableControlTotal, accountsPayableControlTotal } = request.body
    return { data: await validateFinanceMigrationStage(request.server.prisma, tenantId, request.params.id, 'FINANCE_OPENING_BALANCE', request.body.lines, { asOf, accountsReceivableControlTotal, accountsPayableControlTotal }) }
  })

  server.post('/:id/finance/opening-balance/stage', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: financeOpeningBalanceRequestSchema, response: { 201: envelope(financeStageResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const { asOf, accountsReceivableControlTotal, accountsPayableControlTotal } = request.body
    const result = await stageFinanceMigrationBatch(request.server.prisma, tenantId, request.params.id, 'FINANCE_OPENING_BALANCE', request.body.lines, userId, { asOf, accountsReceivableControlTotal, accountsPayableControlTotal })
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('finance')])
    reply.code(201)
    return { data: result }
  })

  server.post('/:id/projects/portfolio/validate', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: projectPortfolioImportRequestSchema, response: { 200: envelope(projectPortfolioImportValidationSchema), ...errorResponses } },
  }, async request => {
    const { tenantId } = requireAuthContext(request)
    return { data: await validateProjectPortfolioImport(request.server.prisma, tenantId, request.params.id, request.body.projects) }
  })

  server.post('/:id/projects/portfolio/import', {
    bodyLimit: 5 * 1024 * 1024,
    preHandler: requirePermission('settings.dataMigration.write'),
    schema: { params: idParamSchema, body: projectPortfolioImportRequestSchema, response: { 201: envelope(projectPortfolioImportResponseSchema), ...errorResponses } },
  }, async (request, reply) => {
    const { tenantId, userId } = requireAuthContext(request)
    const result = await importProjectPortfolio(request.server.prisma, tenantId, request.params.id, request.body.projects, userId)
    request.server.ssePublish(tenantId, [moduleKeyPrefix('settings'), moduleKeyPrefix('projects')])
    reply.code(201)
    return { data: result }
  })
}
