import { createHash } from 'node:crypto'
import { Prisma, type DataMigrationEntity, type PrismaClient } from '@prisma/client'
import type { InventoryProductImportRow } from '@asas/contracts'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'

type Reader = Pick<PrismaClient, 'dataMigrationProject' | 'dataMigrationImportJob' | 'dataMigrationRecordLink' | 'product'>
type ProductRow = {
  sourceId: string; sku: string; name: string; salePrice: string; minThreshold: string | null; avgMonthlyUsage: string | null
  leadTimeDays: string | null; warehouse: string | null; aisle: string | null; bin: string | null; sourceCreatedAt: string | null
}
type Issue = { rowNumber: number; field: string; message: string }

function normalizeRows(input: InventoryProductImportRow[]): ProductRow[] {
  return input.map(row => ({
    sourceId: row.sourceId.trim(), sku: row.sku.trim(), name: row.name.trim(), salePrice: row.salePrice.trim(),
    minThreshold: row.minThreshold?.trim() || null, avgMonthlyUsage: row.avgMonthlyUsage?.trim() || null,
    leadTimeDays: row.leadTimeDays?.trim() || null, warehouse: row.warehouse?.trim() || null,
    aisle: row.aisle?.trim() || null, bin: row.bin?.trim() || null, sourceCreatedAt: row.sourceCreatedAt?.trim() || null,
  }))
}

function contentHash(rows: ProductRow[]): string {
  return createHash('sha256').update(JSON.stringify([...rows].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0))).digest('hex')
}

async function getProject(reader: Reader, tenantId: string, projectId: string) {
  const project = await reader.dataMigrationProject.findFirst({ where: { id: projectId, tenantId }, select: { id: true, status: true, modules: true } })
  if (!project) throw new AppError(404, 'Migration project not found')
  return project
}

function assertProject(project: { modules: string[]; status: string }) {
  if (!project.modules.includes('INVENTORY')) throw new AppError(409, 'Add Inventory to this migration project before importing products')
  if (!['PLANNING', 'IN_PROGRESS'].includes(project.status)) throw new AppError(409, 'This migration project is not accepting imports')
}

async function findJob(reader: Reader, tenantId: string, projectId: string, hash: string) {
  return reader.dataMigrationImportJob.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity: 'INVENTORY_PRODUCTS', idempotencyKey: hash } } })
}

function validateDate(value: string | null) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function validatePrimitive(row: ProductRow, rowNumber: number, issues: Issue[]) {
  const add = (field: string, message: string) => issues.push({ rowNumber, field, message })
  if (!row.sourceId) add('sourceId', 'A stable source record ID is required for safe retry and record linking.')
  else if (row.sourceId.length > 120) add('sourceId', 'Source IDs must be 120 characters or fewer.')
  if (!row.sku || row.sku.length > 64) add('sku', 'SKU is required and must be 64 characters or fewer.')
  if (row.name.length < 1 || row.name.length > 200) add('name', 'Product name must contain 1 to 200 characters.')
  if (!/^\d+(?:\.\d{1,4})?$/.test(row.salePrice) || row.salePrice.length > 19) add('salePrice', 'Sale price must be a non-negative decimal with at most 4 decimal places.')
  const optionalInteger = (value: string | null, field: string, max: number, label: string) => {
    if (value !== null && (!/^\d+$/.test(value) || Number(value) > max || value.length > 10)) add(field, `${label} must be a whole number from 0 to ${max}.`)
  }
  optionalInteger(row.minThreshold, 'minThreshold', 2_147_483_647, 'Minimum stock threshold')
  optionalInteger(row.leadTimeDays, 'leadTimeDays', 2_147_483_647, 'Lead time')
  if (row.avgMonthlyUsage !== null && (!/^\d+(?:\.\d{1,4})?$/.test(row.avgMonthlyUsage) || Number(row.avgMonthlyUsage) > 1_000_000_000)) add('avgMonthlyUsage', 'Average monthly usage must be a non-negative number with at most 4 decimal places.')
  for (const [field, value, max] of [['warehouse', row.warehouse, 200], ['aisle', row.aisle, 64], ['bin', row.bin, 64]] as const) if (value && value.length > max) add(field, `${field} must be ${max} characters or fewer.`)
  if (!validateDate(row.sourceCreatedAt)) add('sourceCreatedAt', 'Source creation date must be a valid YYYY-MM-DD date.')
}

async function validateRows(reader: Reader, tenantId: string, projectId: string, rows: ProductRow[], hash: string) {
  const project = await getProject(reader, tenantId, projectId)
  if (await findJob(reader, tenantId, projectId, hash)) return { totalRows: rows.length, validRows: rows.length, alreadyImported: true, issues: [] as Issue[] }
  assertProject(project)
  const issues: Issue[] = []
  const seenSource = new Map<string, number>()
  const seenSku = new Map<string, number>()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    validatePrimitive(row, rowNumber, issues)
    for (const [value, map, field, label] of [[row.sourceId, seenSource, 'sourceId', 'Source record ID'], [row.sku.toLocaleLowerCase('en-US'), seenSku, 'sku', 'SKU']] as const) {
      if (!value) continue
      const previous = map.get(value)
      if (previous) {
        issues.push({ rowNumber: previous, field, message: `${label} is duplicated again on row ${rowNumber}.` })
        issues.push({ rowNumber, field, message: `${label} was already used on row ${previous}.` })
      } else map.set(value, rowNumber)
    }
  })
  const sourceIds = [...new Set(rows.map(row => row.sourceId).filter(Boolean))]
  if (sourceIds.length) {
    const linked = await reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_PRODUCTS', sourceId: { in: sourceIds } }, select: { sourceId: true } })
    const known = new Set(linked.map(row => row.sourceId))
    rows.forEach((row, index) => { if (row.sourceId && known.has(row.sourceId)) issues.push({ rowNumber: index + 2, field: 'sourceId', message: 'This source ID is already linked in this migration project.' }) })
  }
  const skus = [...new Set(rows.map(row => row.sku).filter(Boolean))]
  if (skus.length) {
    const existing = await reader.product.findMany({ where: { tenantId, sku: { in: skus, mode: 'insensitive' } }, select: { sku: true } })
    const skuSet = new Set(existing.map(product => product.sku.toLocaleLowerCase('en-US')))
    rows.forEach((row, index) => { if (row.sku && skuSet.has(row.sku.toLocaleLowerCase('en-US'))) issues.push({ rowNumber: index + 2, field: 'sku', message: 'This SKU already exists in the workspace. Existing products are not overwritten.' }) })
  }
  return { totalRows: rows.length, validRows: rows.length - new Set(issues.map(issue => issue.rowNumber)).size, alreadyImported: false, issues }
}

function toJob(job: { id: string; entity: DataMigrationEntity; status: 'COMPLETED'; totalRows: number; importedRows: number; createdAt: Date; completedAt: Date }) {
  return { id: job.id, entity: job.entity, status: job.status, totalRows: job.totalRows, importedRows: job.importedRows, createdAt: job.createdAt.toISOString(), completedAt: job.completedAt.toISOString() }
}

export async function validateInventoryProductImport(prisma: PrismaClient, tenantId: string, projectId: string, input: InventoryProductImportRow[]) {
  const rows = normalizeRows(input)
  return validateRows(prisma, tenantId, projectId, rows, contentHash(rows))
}

export async function importInventoryProducts(prisma: PrismaClient, tenantId: string, projectId: string, input: InventoryProductImportRow[], actorId: string) {
  const rows = normalizeRows(input)
  const hash = contentHash(rows)
  const where = { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity: 'INVENTORY_PRODUCTS' as const, idempotencyKey: hash } }
  try {
    return await prisma.$transaction(async tx => {
      const project = await getProject(tx, tenantId, projectId)
      const prior = await tx.dataMigrationImportJob.findUnique({ where })
      if (prior) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      assertProject(project)
      const validation = await validateRows(tx, tenantId, projectId, rows, hash)
      if (validation.issues.length) throw new AppError(409, 'Resolve the product import issues before committing', validation.issues)
      const job = await tx.dataMigrationImportJob.create({ data: { tenantId, projectId, entity: 'INVENTORY_PRODUCTS', status: 'COMPLETED', idempotencyKey: hash, requestHash: hash, totalRows: rows.length, importedRows: rows.length, createdBy: actorId } })
      for (const row of rows) {
        const product = await tx.product.create({ data: {
          tenantId, name: row.name, sku: row.sku, price: new Prisma.Decimal(row.salePrice), stock: 0,
          minThreshold: row.minThreshold === null ? 10 : Number(row.minThreshold),
          avgMonthlyUsage: row.avgMonthlyUsage === null ? null : Number(row.avgMonthlyUsage),
          leadTimeDays: row.leadTimeDays === null ? null : Number(row.leadTimeDays),
          warehouse: row.warehouse, aisle: row.aisle, bin: row.bin,
          ...(row.sourceCreatedAt ? { createdAt: new Date(`${row.sourceCreatedAt}T00:00:00.000Z`) } : {}),
        } })
        await tx.dataMigrationRecordLink.create({ data: { tenantId, projectId, importJobId: job.id, sourceEntity: 'INVENTORY_PRODUCTS', sourceId: row.sourceId, targetEntity: 'INVENTORY_PRODUCTS', targetId: product.id } })
      }
      await tx.dataMigrationProject.update({ where: { id: project.id }, data: { status: 'IN_PROGRESS' } })
      await recordAuditLog(tx, { tenantId, actorId, action: 'dataMigration.inventoryProducts.import', targetType: 'DataMigrationImportJob', targetId: job.id, metadata: { projectId, imported: rows.length, requestHash: hash } })
      return { imported: rows.length, replayed: false, job: toJob(job) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.dataMigrationImportJob.findUnique({ where })
      if (prior?.requestHash === hash) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      throw new AppError(409, 'A product SKU or source ID was imported concurrently. Validate the batch again before retrying.')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new AppError(409, 'Another migration batch changed this project during import. Validate again and retry.')
    throw error
  }
}
