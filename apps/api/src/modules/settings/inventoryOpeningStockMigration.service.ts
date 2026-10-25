import { createHash } from 'node:crypto'
import { Prisma, type DataMigrationEntity, type PrismaClient } from '@prisma/client'
import { Money } from '@asas/domain'
import type { InventoryOpeningStockImportRow } from '@asas/contracts'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'
import { writeStockMovement } from '../inventory/stockMovementWriter.js'
import { ensureInventoryOpeningEquity, postValuedReceipt } from '../inventory/inventoryValuation.service.js'

type Reader = Pick<
  PrismaClient,
  | 'dataMigrationProject'
  | 'dataMigrationImportJob'
  | 'dataMigrationRecordLink'
  | 'product'
  | 'stockMovement'
  | 'tenant'
  | 'inventoryValuationConfig'
  | 'inventoryValuationAccountMapping'
  | 'journalEntry'
>
type StockRow = { sourceProductId: string; quantity: string; asOf: string; unitCost?: string }
type Issue = { rowNumber: number; field: string; message: string }

function normalizeRows(input: InventoryOpeningStockImportRow[]): StockRow[] {
  return input.map(row => {
    const unitCost = row.unitCost?.trim()
    return {
      sourceProductId: row.sourceProductId.trim(),
      quantity: row.quantity.trim(),
      ...(unitCost ? { unitCost } : {}),
      asOf: row.asOf.trim(),
    }
  })
}

function contentHash(rows: StockRow[]): string {
  return createHash('sha256').update(JSON.stringify([...rows].sort((a, b) => a.sourceProductId < b.sourceProductId ? -1 : a.sourceProductId > b.sourceProductId ? 1 : 0))).digest('hex')
}

async function getProject(reader: Reader, tenantId: string, projectId: string) {
  const project = await reader.dataMigrationProject.findFirst({ where: { id: projectId, tenantId }, select: { id: true, name: true, status: true, modules: true } })
  if (!project) throw new AppError(404, 'Migration project not found')
  return project
}

function assertProject(project: { modules: string[]; status: string }) {
  if (!project.modules.includes('INVENTORY')) throw new AppError(409, 'Add Inventory to this migration project before importing opening stock')
  if (!['PLANNING', 'IN_PROGRESS'].includes(project.status)) throw new AppError(409, 'This migration project is not accepting imports')
}

async function findJob(reader: Reader, tenantId: string, projectId: string, hash: string) {
  return reader.dataMigrationImportJob.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity: 'INVENTORY_OPENING_STOCK', idempotencyKey: hash } } })
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

async function validateRows(reader: Reader, tenantId: string, projectId: string, rows: StockRow[], hash: string) {
  const project = await getProject(reader, tenantId, projectId)
  if (await findJob(reader, tenantId, projectId, hash)) return { totalRows: rows.length, validRows: rows.length, alreadyImported: true, issues: [] as Issue[] }
  assertProject(project)

  const [tenant, valuationConfig, financeOpeningCount] = await Promise.all([
    reader.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
    reader.inventoryValuationConfig.findUnique({ where: { tenantId } }),
    reader.journalEntry.count({ where: { tenantId, sourceType: 'OPENING_BALANCE' } }),
  ])
  if (!tenant) throw new AppError(404, 'Workspace not found')

  const issues: Issue[] = []
  const seen = new Map<string, number>()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (!row.sourceProductId) issues.push({ rowNumber, field: 'sourceProductId', message: 'A source product ID is required to match the catalog import.' })
    else if (row.sourceProductId.length > 120) issues.push({ rowNumber, field: 'sourceProductId', message: 'Source product IDs must be 120 characters or fewer.' })
    if (!/^(?:0|[1-9]\d*)$/.test(row.quantity) || row.quantity.length > 10 || Number(row.quantity) > 2_147_483_647) issues.push({ rowNumber, field: 'quantity', message: 'Opening quantity must be a whole number from 0 to 2,147,483,647.' })
    if (!isCalendarDate(row.asOf)) issues.push({ rowNumber, field: 'asOf', message: 'Opening stock date must be a valid YYYY-MM-DD calendar date.' })
    if (row.sourceProductId) {
      const prior = seen.get(row.sourceProductId)
      if (prior) {
        issues.push({ rowNumber: prior, field: 'sourceProductId', message: `This product is repeated again on row ${rowNumber}; one opening quantity per product is supported.` })
        issues.push({ rowNumber, field: 'sourceProductId', message: `This product was already included on row ${prior}.` })
      } else seen.set(row.sourceProductId, rowNumber)
    }
  })

  const sourceIds = [...new Set(rows.map(row => row.sourceProductId).filter(Boolean))]
  const [productLinks, importedLinks] = await Promise.all([
    sourceIds.length ? reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_PRODUCTS', sourceId: { in: sourceIds } }, select: { sourceId: true, targetId: true } }) : [],
    sourceIds.length ? reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_OPENING_STOCK', sourceId: { in: sourceIds } }, select: { sourceId: true } }) : [],
  ])
  const linkBySource = new Map(productLinks.map(link => [link.sourceId, link.targetId]))
  const productIds = [...new Set(productLinks.map(link => link.targetId))]
  const products = productIds.length ? await reader.product.findMany({
    where: { tenantId, id: { in: productIds } },
    select: { id: true, stock: true, sku: true, currency: true, archivedAt: true, _count: { select: { movements: true } } },
  }) : []
  const productById = new Map(products.map(product => [product.id, product]))
  const currencies = [...new Set(products.map(product => product.currency ?? tenant.currency))]
  const mappings = valuationConfig && currencies.length ? await reader.inventoryValuationAccountMapping.findMany({
    where: { tenantId, currency: { in: currencies } },
    select: { currency: true },
  }) : []
  const mappedCurrencies = new Set(mappings.map(mapping => mapping.currency))
  const priorOpeningSources = new Set(importedLinks.map(link => link.sourceId))
  const rowSeen = new Set<string>()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (!row.sourceProductId) return
    if (rowSeen.has(row.sourceProductId)) return
    rowSeen.add(row.sourceProductId)
    if (!linkBySource.has(row.sourceProductId)) issues.push({ rowNumber, field: 'sourceProductId', message: 'Import the product catalog first; this source product ID is not linked in this migration project.' })
    if (priorOpeningSources.has(row.sourceProductId)) issues.push({ rowNumber, field: 'sourceProductId', message: 'Opening stock for this source product is already linked in this migration project.' })
    const productId = linkBySource.get(row.sourceProductId)
    const product = productId ? productById.get(productId) : null
    if (productId && !product) issues.push({ rowNumber, field: 'sourceProductId', message: 'The linked Asas product no longer exists in this workspace. Review the catalog crosswalk before importing stock.' })
    else if (product?.archivedAt) issues.push({ rowNumber, field: 'sourceProductId', message: `Asas product ${product.sku} is archived. Restore or reconcile it before importing opening stock.` })
    else if (product && (product.stock !== 0 || product._count.movements !== 0)) issues.push({ rowNumber, field: 'sourceProductId', message: `Asas product ${product.sku} already has stock or stock movements. Reconcile it before importing a source opening quantity.` })

    const positiveQuantity = Number(row.quantity) > 0
    if (financeOpeningCount > 0 && positiveQuantity) {
      issues.push({
        rowNumber,
        field: 'quantity',
        message: 'A Finance opening balance is already posted. Positive opening stock cannot establish a second opening position; a coordinated Inventory/Finance opening is required before this import can be used.',
      })
    }

    const currency = product?.currency ?? tenant.currency
    if (row.unitCost !== undefined) {
      if (row.quantity === '0') {
        issues.push({ rowNumber, field: 'unitCost', message: 'A zero opening quantity cannot carry a unit cost.' })
      }
      if (!valuationConfig) {
        issues.push({ rowNumber, field: 'unitCost', message: 'Inventory valuation is not configured. Remove the unit cost to import quantity only, or configure the valuation policy first.' })
      } else {
        let cost: Money | null = null
        try {
          cost = Money.fromDecimal(row.unitCost, currency)
        } catch {
          issues.push({ rowNumber, field: 'unitCost', message: `The source unit cost must be an exact amount in ${currency}.` })
        }
        if (cost && !cost.isPositive()) {
          issues.push({ rowNumber, field: 'unitCost', message: 'A source unit cost must be greater than zero.' })
        }
        if (!mappedCurrencies.has(currency)) {
          issues.push({ rowNumber, field: 'unitCost', message: `No inventory valuation ledger mapping exists for ${currency}. Configure the mapping before importing valued opening stock.` })
        }
      }
    } else if (valuationConfig && positiveQuantity) {
      issues.push({
        rowNumber,
        field: 'unitCost',
        message: 'Inventory valuation is configured, so a positive opening quantity requires a positive source unit cost. Add the source cost to this row; quantity-only opening rows are accepted only before valuation is configured.',
      })
    }
  })
  return { totalRows: rows.length, validRows: rows.length - new Set(issues.map(issue => issue.rowNumber)).size, alreadyImported: false, issues }
}

function toJob(job: { id: string; entity: DataMigrationEntity; status: 'COMPLETED'; totalRows: number; importedRows: number; createdAt: Date; completedAt: Date }) {
  return { id: job.id, entity: job.entity, status: job.status, totalRows: job.totalRows, importedRows: job.importedRows, createdAt: job.createdAt.toISOString(), completedAt: job.completedAt.toISOString() }
}

export async function validateInventoryOpeningStockImport(prisma: PrismaClient, tenantId: string, projectId: string, input: InventoryOpeningStockImportRow[]) {
  const rows = normalizeRows(input)
  return validateRows(prisma, tenantId, projectId, rows, contentHash(rows))
}

export async function importInventoryOpeningStock(prisma: PrismaClient, tenantId: string, projectId: string, input: InventoryOpeningStockImportRow[], actorId: string) {
  const rows = normalizeRows(input)
  const hash = contentHash(rows)
  const where = { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity: 'INVENTORY_OPENING_STOCK' as const, idempotencyKey: hash } }
  try {
    return await prisma.$transaction(async tx => {
      const project = await getProject(tx, tenantId, projectId)
      const prior = await tx.dataMigrationImportJob.findUnique({ where })
      if (prior) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      assertProject(project)
      const validation = await validateRows(tx, tenantId, projectId, rows, hash)
      if (validation.issues.length) throw new AppError(409, 'Resolve the opening stock issues before committing', validation.issues)
      const sourceIds = rows.map(row => row.sourceProductId)
      const links = await tx.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_PRODUCTS', sourceId: { in: sourceIds } }, select: { sourceId: true, targetId: true } })
      const targetBySource = new Map(links.map(link => [link.sourceId, link.targetId]))
      const targetIds = [...new Set(targetBySource.values())]
      const [tenant, products] = await Promise.all([
        tx.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
        targetIds.length ? tx.product.findMany({ where: { tenantId, id: { in: targetIds } }, select: { id: true, currency: true } }) : [],
      ])
      if (!tenant) throw new AppError(404, 'Workspace not found')
      const productById = new Map(products.map(product => [product.id, product]))
      const equityAccountByCurrency = new Map<string, string>()
      const job = await tx.dataMigrationImportJob.create({ data: { tenantId, projectId, entity: 'INVENTORY_OPENING_STOCK', status: 'COMPLETED', idempotencyKey: hash, requestHash: hash, totalRows: rows.length, importedRows: rows.length, createdBy: actorId } })
      let valuedRows = 0
      let unvaluedPositiveRows = 0
      for (const row of rows) {
        const productId = targetBySource.get(row.sourceProductId)
        if (!productId) throw new AppError(409, 'The product mapping changed during import. Validate again and retry.')
        const quantity = Number(row.quantity)
        const currency = productById.get(productId)?.currency ?? tenant.currency
        const movementResult = await writeStockMovement(tx, {
          tenantId, productId, delta: quantity,
          note: row.unitCost
            ? `Opening stock migrated from ${project.name} as of ${row.asOf} at source unit cost ${row.unitCost} ${currency}`
            : `Opening stock migrated from ${project.name} as of ${row.asOf}`,
          createdAt: new Date(`${row.asOf}T00:00:00.000Z`), requireEmpty: true,
        })
        if (row.unitCost) {
          if (!movementResult.movement) throw new AppError(409, 'A valued opening row must create a positive stock movement. Validate the batch again.')
          let equityAccountId = equityAccountByCurrency.get(currency)
          if (!equityAccountId) {
            equityAccountId = await ensureInventoryOpeningEquity(tx, tenantId, currency)
            equityAccountByCurrency.set(currency, equityAccountId)
          }
          await postValuedReceipt(tx, {
            tenantId,
            productId,
            stockMovementId: movementResult.movement.id,
            quantity,
            unitCost: row.unitCost,
            reason: 'OPENING_BALANCE',
            offsetAccountId: equityAccountId,
            postedAt: movementResult.movement.createdAt,
            actorId,
          })
          valuedRows += 1
        } else if (quantity > 0) {
          unvaluedPositiveRows += 1
        }
        await tx.dataMigrationRecordLink.create({ data: { tenantId, projectId, importJobId: job.id, sourceEntity: 'INVENTORY_OPENING_STOCK', sourceId: row.sourceProductId, targetEntity: 'INVENTORY_PRODUCTS', targetId: productId } })
      }
      await tx.dataMigrationProject.update({ where: { id: project.id }, data: { status: 'IN_PROGRESS' } })
      await recordAuditLog(tx, { tenantId, actorId, action: 'dataMigration.inventoryOpeningStock.import', targetType: 'DataMigrationImportJob', targetId: job.id, metadata: { projectId, imported: rows.length, positiveMovements: rows.filter(row => Number(row.quantity) > 0).length, valuedRows, unvaluedPositiveRows, requestHash: hash } })
      return { imported: rows.length, replayed: false, job: toJob(job) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.dataMigrationImportJob.findUnique({ where })
      if (prior?.requestHash === hash) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      throw new AppError(409, 'A product opening-stock row was imported concurrently. Validate the batch again before retrying.')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new AppError(409, 'Another migration batch changed this project during import. Validate again and retry.')
    throw error
  }
}
