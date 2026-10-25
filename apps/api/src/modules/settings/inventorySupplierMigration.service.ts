import { createHash } from 'node:crypto'
import { Prisma, type DataMigrationEntity, type PrismaClient } from '@prisma/client'
import type { InventoryProductSupplierImportRow, InventorySupplierImportRow } from '@asas/contracts'
import { recordAuditLog } from '../../services/auditLog.js'
import { AppError } from '../../utils/errors.js'

type Reader = Pick<PrismaClient, 'dataMigrationProject' | 'dataMigrationImportJob' | 'dataMigrationRecordLink' | 'supplier' | 'product' | 'productSupplier'>
type SupplierRow = { sourceId: string; name: string; sourceCreatedAt: string | null }
type RelationshipRow = { sourceProductId: string; sourceSupplierId: string }
type Issue = { rowNumber: number; field: string; message: string }
const MAX_SOURCE_ID = 120

const normalizeSuppliers = (input: InventorySupplierImportRow[]): SupplierRow[] => input.map(row => ({ sourceId: row.sourceId.trim(), name: row.name.trim(), sourceCreatedAt: row.sourceCreatedAt?.trim() || null }))
const normalizeRelationships = (input: InventoryProductSupplierImportRow[]): RelationshipRow[] => input.map(row => ({ sourceProductId: row.sourceProductId.trim(), sourceSupplierId: row.sourceSupplierId.trim() }))
const hashRows = (rows: object[], sortKey: (row: any) => string) => createHash('sha256').update(JSON.stringify([...rows].sort((a, b) => sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0))).digest('hex')
const relationshipSourceId = (row: RelationshipRow) => JSON.stringify([row.sourceProductId, row.sourceSupplierId])

async function getProject(reader: Reader, tenantId: string, projectId: string) {
  const project = await reader.dataMigrationProject.findFirst({ where: { id: projectId, tenantId }, select: { id: true, status: true, modules: true } })
  if (!project) throw new AppError(404, 'Migration project not found')
  return project
}

function assertProject(project: { modules: string[]; status: string }) {
  if (!project.modules.includes('INVENTORY')) throw new AppError(409, 'Add Inventory to this migration project before importing suppliers')
  if (!['PLANNING', 'IN_PROGRESS'].includes(project.status)) throw new AppError(409, 'This migration project is not accepting imports')
}

function isCalendarDate(value: string | null) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function toJob(job: { id: string; entity: DataMigrationEntity; status: 'COMPLETED'; totalRows: number; importedRows: number; createdAt: Date; completedAt: Date }) {
  return { id: job.id, entity: job.entity, status: job.status, totalRows: job.totalRows, importedRows: job.importedRows, createdAt: job.createdAt.toISOString(), completedAt: job.completedAt.toISOString() }
}

async function findJob(reader: Reader, tenantId: string, projectId: string, entity: DataMigrationEntity, hash: string) {
  return reader.dataMigrationImportJob.findUnique({ where: { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity, idempotencyKey: hash } } })
}

async function validateSupplierRows(reader: Reader, tenantId: string, projectId: string, rows: SupplierRow[], hash: string) {
  const project = await getProject(reader, tenantId, projectId)
  if (await findJob(reader, tenantId, projectId, 'INVENTORY_SUPPLIERS', hash)) return { totalRows: rows.length, validRows: rows.length, alreadyImported: true, issues: [] as Issue[] }
  assertProject(project)
  const issues: Issue[] = []
  const seen = new Map<string, number>()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (!row.sourceId || row.sourceId.length > MAX_SOURCE_ID) issues.push({ rowNumber, field: 'sourceId', message: `A stable supplier source ID of 1 to ${MAX_SOURCE_ID} characters is required.` })
    if (!row.name || row.name.length > 200) issues.push({ rowNumber, field: 'name', message: 'Supplier name must contain 1 to 200 characters.' })
    if (!isCalendarDate(row.sourceCreatedAt)) issues.push({ rowNumber, field: 'sourceCreatedAt', message: 'Source creation date must be a valid YYYY-MM-DD date.' })
    if (!row.sourceId) return
    const prior = seen.get(row.sourceId)
    if (prior) {
      issues.push({ rowNumber: prior, field: 'sourceId', message: `This supplier source ID appears again on row ${rowNumber}.` })
      issues.push({ rowNumber, field: 'sourceId', message: `This supplier source ID was already used on row ${prior}.` })
    } else seen.set(row.sourceId, rowNumber)
  })
  const sourceIds = [...new Set(rows.map(row => row.sourceId).filter(Boolean))]
  const linked = sourceIds.length ? await reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_SUPPLIERS', sourceId: { in: sourceIds } }, select: { sourceId: true } }) : []
  const known = new Set(linked.map(row => row.sourceId))
  rows.forEach((row, index) => { if (row.sourceId && known.has(row.sourceId)) issues.push({ rowNumber: index + 2, field: 'sourceId', message: 'This supplier source ID is already linked in this migration project.' }) })
  return { totalRows: rows.length, validRows: rows.length - new Set(issues.map(issue => issue.rowNumber)).size, alreadyImported: false, issues }
}

export async function validateInventorySupplierImport(prisma: PrismaClient, tenantId: string, projectId: string, input: InventorySupplierImportRow[]) {
  const rows = normalizeSuppliers(input)
  return validateSupplierRows(prisma, tenantId, projectId, rows, hashRows(rows, row => row.sourceId))
}

export async function importInventorySuppliers(prisma: PrismaClient, tenantId: string, projectId: string, input: InventorySupplierImportRow[], actorId: string) {
  const rows = normalizeSuppliers(input)
  const hash = hashRows(rows, row => row.sourceId)
  const entity = 'INVENTORY_SUPPLIERS' as const
  const where = { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity, idempotencyKey: hash } }
  try {
    return await prisma.$transaction(async tx => {
      const project = await getProject(tx, tenantId, projectId)
      const prior = await tx.dataMigrationImportJob.findUnique({ where })
      if (prior) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      assertProject(project)
      const validation = await validateSupplierRows(tx, tenantId, projectId, rows, hash)
      if (validation.issues.length) throw new AppError(409, 'Resolve the supplier import issues before committing', validation.issues)
      const job = await tx.dataMigrationImportJob.create({ data: { tenantId, projectId, entity, status: 'COMPLETED', idempotencyKey: hash, requestHash: hash, totalRows: rows.length, importedRows: rows.length, createdBy: actorId } })
      for (const row of rows) {
        const supplier = await tx.supplier.create({ data: { tenantId, name: row.name, ...(row.sourceCreatedAt ? { createdAt: new Date(`${row.sourceCreatedAt}T00:00:00.000Z`) } : {}) } })
        await tx.dataMigrationRecordLink.create({ data: { tenantId, projectId, importJobId: job.id, sourceEntity: entity, sourceId: row.sourceId, targetEntity: entity, targetId: supplier.id } })
      }
      await tx.dataMigrationProject.update({ where: { id: project.id }, data: { status: 'IN_PROGRESS' } })
      await recordAuditLog(tx, { tenantId, actorId, action: 'dataMigration.inventorySuppliers.import', targetType: 'DataMigrationImportJob', targetId: job.id, metadata: { projectId, imported: rows.length, requestHash: hash } })
      return { imported: rows.length, replayed: false, job: toJob(job) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.dataMigrationImportJob.findUnique({ where })
      if (prior?.requestHash === hash) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      throw new AppError(409, 'A supplier source ID was imported concurrently. Validate the batch again before retrying.')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new AppError(409, 'Another migration batch changed this project during import. Validate again and retry.')
    throw error
  }
}

async function validateRelationshipRows(reader: Reader, tenantId: string, projectId: string, rows: RelationshipRow[], hash: string) {
  const project = await getProject(reader, tenantId, projectId)
  if (await findJob(reader, tenantId, projectId, 'INVENTORY_PRODUCT_SUPPLIERS', hash)) return { totalRows: rows.length, validRows: rows.length, alreadyImported: true, issues: [] as Issue[] }
  assertProject(project)
  const issues: Issue[] = []
  const seen = new Map<string, number>()
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    for (const [field, value] of [['sourceProductId', row.sourceProductId], ['sourceSupplierId', row.sourceSupplierId]] as const) {
      if (!value || value.length > MAX_SOURCE_ID) issues.push({ rowNumber, field, message: `A source ID of 1 to ${MAX_SOURCE_ID} characters is required.` })
    }
    const key = relationshipSourceId(row)
    const prior = seen.get(key)
    if (prior) {
      issues.push({ rowNumber: prior, field: 'sourceProductId', message: `This product-supplier association appears again on row ${rowNumber}.` })
      issues.push({ rowNumber, field: 'sourceProductId', message: `This association was already included on row ${prior}.` })
    } else seen.set(key, rowNumber)
  })
  const productIds = [...new Set(rows.map(row => row.sourceProductId).filter(Boolean))]
  const supplierIds = [...new Set(rows.map(row => row.sourceSupplierId).filter(Boolean))]
  const [productLinks, supplierLinks, relationshipLinks] = await Promise.all([
    productIds.length ? reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_PRODUCTS', sourceId: { in: productIds } }, select: { sourceId: true, targetId: true } }) : [],
    supplierIds.length ? reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_SUPPLIERS', sourceId: { in: supplierIds } }, select: { sourceId: true, targetId: true } }) : [],
    rows.length ? reader.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_PRODUCT_SUPPLIERS', sourceId: { in: rows.map(relationshipSourceId) } }, select: { sourceId: true } }) : [],
  ])
  const productBySource = new Map(productLinks.map(link => [link.sourceId, link.targetId]))
  const supplierBySource = new Map(supplierLinks.map(link => [link.sourceId, link.targetId]))
  const linkedRelationshipIds = new Set(relationshipLinks.map(link => link.sourceId))
  const targets = await Promise.all([
    productBySource.size ? reader.product.findMany({ where: { tenantId, id: { in: [...productBySource.values()] } }, select: { id: true, sku: true, archivedAt: true } }) : [],
    supplierBySource.size ? reader.supplier.findMany({ where: { tenantId, id: { in: [...supplierBySource.values()] } }, select: { id: true, name: true } }) : [],
  ])
  const productById = new Map(targets[0].map(product => [product.id, product]))
  const supplierById = new Map(targets[1].map(supplier => [supplier.id, supplier]))
  rows.forEach((row, index) => {
    const rowNumber = index + 2
    if (row.sourceProductId && !productBySource.has(row.sourceProductId)) issues.push({ rowNumber, field: 'sourceProductId', message: 'Import the product catalog first; this source product ID is not linked in this migration project.' })
    if (row.sourceSupplierId && !supplierBySource.has(row.sourceSupplierId)) issues.push({ rowNumber, field: 'sourceSupplierId', message: 'Import Inventory suppliers first; this source supplier ID is not linked in this migration project.' })
    if (linkedRelationshipIds.has(relationshipSourceId(row))) issues.push({ rowNumber, field: 'sourceProductId', message: 'This product-supplier source association is already linked in this migration project.' })
    const product = productById.get(productBySource.get(row.sourceProductId) ?? '')
    if (product?.archivedAt) issues.push({ rowNumber, field: 'sourceProductId', message: `Asas product ${product.sku} is archived; restore it before linking a supplier.` })
    if (productBySource.has(row.sourceProductId) && !product) issues.push({ rowNumber, field: 'sourceProductId', message: 'The linked product no longer exists in this workspace.' })
    const supplier = supplierById.get(supplierBySource.get(row.sourceSupplierId) ?? '')
    if (supplierBySource.has(row.sourceSupplierId) && !supplier) issues.push({ rowNumber, field: 'sourceSupplierId', message: 'The linked supplier no longer exists in this workspace.' })
  })
  return { totalRows: rows.length, validRows: rows.length - new Set(issues.map(issue => issue.rowNumber)).size, alreadyImported: false, issues }
}

export async function validateInventoryProductSupplierImport(prisma: PrismaClient, tenantId: string, projectId: string, input: InventoryProductSupplierImportRow[]) {
  const rows = normalizeRelationships(input)
  return validateRelationshipRows(prisma, tenantId, projectId, rows, hashRows(rows, relationshipSourceId))
}

export async function importInventoryProductSuppliers(prisma: PrismaClient, tenantId: string, projectId: string, input: InventoryProductSupplierImportRow[], actorId: string) {
  const rows = normalizeRelationships(input)
  const hash = hashRows(rows, relationshipSourceId)
  const entity = 'INVENTORY_PRODUCT_SUPPLIERS' as const
  const where = { tenantId_projectId_entity_idempotencyKey: { tenantId, projectId, entity, idempotencyKey: hash } }
  try {
    return await prisma.$transaction(async tx => {
      const project = await getProject(tx, tenantId, projectId)
      const prior = await tx.dataMigrationImportJob.findUnique({ where })
      if (prior) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      assertProject(project)
      const validation = await validateRelationshipRows(tx, tenantId, projectId, rows, hash)
      if (validation.issues.length) throw new AppError(409, 'Resolve the product-supplier import issues before committing', validation.issues)
      const sourceProductIds = [...new Set(rows.map(row => row.sourceProductId))]
      const sourceSupplierIds = [...new Set(rows.map(row => row.sourceSupplierId))]
      const [productLinks, supplierLinks] = await Promise.all([
        tx.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_PRODUCTS', sourceId: { in: sourceProductIds } }, select: { sourceId: true, targetId: true } }),
        tx.dataMigrationRecordLink.findMany({ where: { tenantId, projectId, sourceEntity: 'INVENTORY_SUPPLIERS', sourceId: { in: sourceSupplierIds } }, select: { sourceId: true, targetId: true } }),
      ])
      const productBySource = new Map(productLinks.map(link => [link.sourceId, link.targetId]))
      const supplierBySource = new Map(supplierLinks.map(link => [link.sourceId, link.targetId]))
      const job = await tx.dataMigrationImportJob.create({ data: { tenantId, projectId, entity, status: 'COMPLETED', idempotencyKey: hash, requestHash: hash, totalRows: rows.length, importedRows: rows.length, createdBy: actorId } })
      for (const row of rows) {
        const productId = productBySource.get(row.sourceProductId)
        const supplierId = supplierBySource.get(row.sourceSupplierId)
        if (!productId || !supplierId) throw new AppError(409, 'A product or supplier mapping changed during import. Validate again and retry.')
        const association = await tx.productSupplier.upsert({
          where: { productId_supplierId: { productId, supplierId } },
          create: { productId, supplierId },
          update: {},
          select: { id: true },
        })
        await tx.dataMigrationRecordLink.create({ data: { tenantId, projectId, importJobId: job.id, sourceEntity: entity, sourceId: relationshipSourceId(row), targetEntity: entity, targetId: association.id } })
      }
      await tx.dataMigrationProject.update({ where: { id: project.id }, data: { status: 'IN_PROGRESS' } })
      await recordAuditLog(tx, { tenantId, actorId, action: 'dataMigration.inventoryProductSuppliers.import', targetType: 'DataMigrationImportJob', targetId: job.id, metadata: { projectId, imported: rows.length, requestHash: hash } })
      return { imported: rows.length, replayed: false, job: toJob(job) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const prior = await prisma.dataMigrationImportJob.findUnique({ where })
      if (prior?.requestHash === hash) return { imported: prior.importedRows, replayed: true, job: toJob(prior) }
      throw new AppError(409, 'A product-supplier association was imported concurrently. Validate the batch again before retrying.')
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new AppError(409, 'Another migration batch changed this project during import. Validate again and retry.')
    throw error
  }
}
