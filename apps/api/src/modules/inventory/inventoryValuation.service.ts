/**
 * Inventory valuation service — company costing policy, explicit ledger-account mapping, valued
 * receipts/issues, opening valuation of existing quantity, and subledger reconciliation.
 *
 * Boundaries this module deliberately keeps:
 *
 * - A product's selling price is never a cost. Every inbound value comes from an explicit unit
 *   cost supplied by the operator or the purchase order, and every outbound value comes from the
 *   configured costing method (FIFO or weighted average).
 * - Quantity and value advance in the same database transaction. A movement without a valuation
 *   event is visible in the reconciliation report as unvalued; it is never silently valued later.
 * - Opening valuation assigns cost to on-hand quantity that has no established cost. It records a
 *   valuation event and (for FIFO) a layer without a stock movement, because no new units arrived.
 *   It values only the unvalued remainder of a partially valued position.
 * - Accounting follows the policy selected by the workspace: purchase receipts credit goods
 *   received not invoiced, customer returns reverse cost of goods sold, issues debit cost of
 *   goods sold or shrinkage, and positive count corrections credit an adjustment gain.
 */
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import {
  Money,
  issueInventoryCost,
  receiveInventoryCost,
  type InventoryCostPosition,
} from '@asas/domain'
import type {
  InventoryCostingMethod,
  InventoryCostReason,
  InventoryValuationReport,
  InventoryValuationSetup,
  InventoryValuationSetupWriteInput,
  LedgerAccountKind,
} from '@asas/contracts'
import { AppError } from '../../utils/errors.js'
import { recordAuditLog } from '../../services/auditLog.js'
import { recordInventoryJournal, reverseInventoryIssueJournal } from '../finance/ledger.service.js'

type Tx = Prisma.TransactionClient
type Client = PrismaClient | Tx

const OPENING_EQUITY_CODE = 'INVENTORY_OPENING_EQUITY'

const ACCOUNT_ROLES = [
  ['inventoryAsset', 'inventoryAssetAccountCode', 'ASSET'],
  ['costOfGoodsSold', 'costOfGoodsSoldAccountCode', 'EXPENSE'],
  ['goodsReceivedNotInvoiced', 'goodsReceivedNotInvoicedAccountCode', 'LIABILITY'],
  ['adjustmentExpense', 'adjustmentExpenseAccountCode', 'EXPENSE'],
  ['adjustmentGain', 'adjustmentGainAccountCode', 'INCOME'],
] as const

type AccountRole = (typeof ACCOUNT_ROLES)[number][0]
type MappingRow = {
  currency: string
  inventoryAssetAccountCode: string
  costOfGoodsSoldAccountCode: string
  goodsReceivedNotInvoicedAccountCode: string
  adjustmentExpenseAccountCode: string
  adjustmentGainAccountCode: string
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function roleField(role: AccountRole): (typeof ACCOUNT_ROLES)[number][1] {
  return ACCOUNT_ROLES.find(([candidate]) => candidate === role)![1]
}

function roleKind(role: AccountRole): LedgerAccountKind {
  return ACCOUNT_ROLES.find(([candidate]) => candidate === role)![2]
}

async function readSetup(client: Client, tenantId: string): Promise<InventoryValuationSetup> {
  const [config, mappings, valuationPostings] = await Promise.all([
    client.inventoryValuationConfig.findUnique({ where: { tenantId } }),
    client.inventoryValuationAccountMapping.findMany({ where: { tenantId }, orderBy: { currency: 'asc' } }),
    client.inventoryValuationEvent.count({ where: { tenantId } }),
  ])
  if (!config) {
    return {
      configured: false,
      costingMethod: null,
      configuredAt: null,
      valuationPostings,
      mappings: [],
    }
  }

  const currencies = mappings.map(mapping => mapping.currency)
  const accounts = currencies.length === 0
    ? []
    : await client.ledgerAccount.findMany({ where: { tenantId, currency: { in: currencies } } })
  const byKey = new Map(accounts.map(account => [`${account.currency}:${account.code}`, account]))

  const resolved = mappings.map(mapping => {
    const resolvedAccounts = {} as Record<AccountRole, {
      id: string; code: string; name: string; kind: LedgerAccountKind; currency: string
    }>
    for (const [role] of ACCOUNT_ROLES) {
      const code = mapping[roleField(role)]
      const account = byKey.get(`${mapping.currency}:${code}`)
      if (!account) {
        throw new AppError(
          409,
          `Inventory valuation for ${mapping.currency} references missing ledger account ${code}. Save the valuation setup again to recreate it.`,
        )
      }
      resolvedAccounts[role] = {
        id: account.id,
        code: account.code,
        name: account.name,
        kind: account.kind as LedgerAccountKind,
        currency: account.currency,
      }
    }
    return { currency: mapping.currency, accounts: resolvedAccounts }
  })

  return {
    configured: true,
    costingMethod: config.costingMethod as InventoryCostingMethod,
    configuredAt: config.configuredAt.toISOString(),
    valuationPostings,
    mappings: resolved,
  }
}

export async function getValuationSetup(prisma: PrismaClient, tenantId: string): Promise<InventoryValuationSetup> {
  return readSetup(prisma, tenantId)
}

/**
 * Persist the company costing policy and its real ledger accounts. Account codes are created only
 * when absent; an existing account with a different accounting kind is a conflict rather than a
 * silent reclassification. The costing method is immutable once valuation postings exist because
 * FIFO layers and a weighted-average carrying value cannot be reinterpreted safely.
 */
export async function saveValuationSetup(
  prisma: PrismaClient,
  tenantId: string,
  input: InventoryValuationSetupWriteInput,
  actorId: string,
): Promise<InventoryValuationSetup> {
  return prisma.$transaction(async tx => {
    const [existingConfig, valuationPostings, previousMappings] = await Promise.all([
      tx.inventoryValuationConfig.findUnique({ where: { tenantId } }),
      tx.inventoryValuationEvent.count({ where: { tenantId } }),
      tx.inventoryValuationAccountMapping.findMany({ where: { tenantId }, select: { currency: true } }),
    ])

    if (existingConfig && existingConfig.costingMethod !== input.costingMethod && valuationPostings > 0) {
      throw new AppError(
        409,
        `The costing method cannot change after ${valuationPostings} valuation posting(s). FIFO layers and weighted-average carrying values are not interchangeable.`,
      )
    }

    const currencies = input.mappings.map(mapping => mapping.currency)
    const removedCurrencies = previousMappings
      .map(mapping => mapping.currency)
      .filter(currency => !currencies.includes(currency))
    if (removedCurrencies.length > 0) {
      const valued = await tx.inventoryValuationBalance.findFirst({
        where: { tenantId, currency: { in: removedCurrencies } },
        select: { currency: true },
      })
      if (valued) {
        throw new AppError(
          409,
          `Cannot remove the ${valued.currency} mapping while stock is valued in that currency. Issue or revalue the position before changing the supported currencies.`,
        )
      }
    }

    for (const mapping of input.mappings) {
      const codes = {} as Record<(typeof ACCOUNT_ROLES)[number][1], string>
      for (const [role, field, kind] of ACCOUNT_ROLES) {
        const supplied = mapping.accounts[role]
        const code = normalizeCode(supplied.code)
        const existing = await tx.ledgerAccount.findUnique({
          where: { tenantId_code_currency: { tenantId, code, currency: mapping.currency } },
        })
        if (existing) {
          if (existing.kind !== kind) {
            throw new AppError(
              409,
              `Ledger account ${code} (${mapping.currency}) is ${existing.kind}; the ${role} role must use an ${kind} account.`,
            )
          }
        } else {
          await tx.ledgerAccount.create({
            data: { tenantId, code, name: supplied.name.trim(), kind, currency: mapping.currency },
          })
        }
        codes[field] = code
      }

      await tx.inventoryValuationAccountMapping.upsert({
        where: { tenantId_currency: { tenantId, currency: mapping.currency } },
        create: { tenantId, currency: mapping.currency, ...codes },
        update: codes,
      })
    }

    // A currency removed from the policy stops being a supported valuation currency. Existing
    // journals and valuation events keep their account references, so history is unaffected.
    await tx.inventoryValuationAccountMapping.deleteMany({
      where: { tenantId, currency: { notIn: currencies } },
    })

    await tx.inventoryValuationConfig.upsert({
      where: { tenantId },
      create: { tenantId, costingMethod: input.costingMethod },
      update: { costingMethod: input.costingMethod },
    })

    await recordAuditLog(tx, {
      tenantId,
      actorId,
      action: 'inventory.valuation.configure',
      targetType: 'InventoryValuationConfig',
      targetId: tenantId,
      metadata: {
        costingMethod: input.costingMethod,
        currencies,
        previousMethod: existingConfig?.costingMethod ?? null,
        previousCurrencies: previousMappings.map(mapping => mapping.currency),
      },
    })

    return readSetup(tx, tenantId)
  })
}

interface ValuationContext {
  tenantId: string
  product: { id: string; sku: string; name: string; currency: string | null }
  currency: string
  workspaceCurrency: string
  method: InventoryCostingMethod
  mapping: MappingRow
}

async function loadContext(tx: Tx, tenantId: string, productId: string): Promise<ValuationContext> {
  const [product, tenant, config] = await Promise.all([
    tx.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, sku: true, name: true, currency: true },
    }),
    tx.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
    tx.inventoryValuationConfig.findUnique({ where: { tenantId } }),
  ])
  if (!product) throw new AppError(404, 'Product not found')
  if (!tenant) throw new AppError(404, 'Workspace not found')
  if (!config) {
    throw new AppError(409, 'Inventory valuation is not configured. Set the costing method and ledger accounts before recording valued stock.')
  }
  const currency = product.currency ?? tenant.currency
  const mapping = await tx.inventoryValuationAccountMapping.findUnique({
    where: { tenantId_currency: { tenantId, currency } },
  })
  if (!mapping) {
    throw new AppError(409, `Inventory valuation has no ledger-account mapping for ${currency}. Add one in the valuation setup.`)
  }
  return {
    tenantId,
    product,
    currency,
    workspaceCurrency: tenant.currency,
    method: config.costingMethod as InventoryCostingMethod,
    mapping: mapping as MappingRow,
  }
}

async function loadPosition(tx: Tx, context: ValuationContext) {
  const balance = await tx.inventoryValuationBalance.findUnique({
    where: { productId_tenantId: { productId: context.product.id, tenantId: context.tenantId } },
  })
  if (balance && balance.currency !== context.currency) {
    throw new AppError(
      409,
      `This product's valuation balance is in ${balance.currency}, but the product is now valued in ${context.currency}. Resolve the currency mismatch before recording another valued movement.`,
    )
  }
  const layers = context.method === 'FIFO'
    ? await tx.inventoryCostLayer.findMany({
        where: { tenantId: context.tenantId, productId: context.product.id, remainingQuantity: { gt: 0 } },
        orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      })
    : []
  const position: InventoryCostPosition = {
    onHandQuantity: balance?.onHandQuantity ?? 0,
    inventoryValue: Money.fromDecimal(balance?.inventoryValue.toString() ?? '0', context.currency),
    layers: layers.map(layer => ({
      id: layer.id,
      receivedAt: layer.receivedAt,
      remainingQuantity: layer.remainingQuantity,
      remainingValue: Money.fromDecimal(layer.remainingValue.toString(), context.currency),
    })),
  }
  return { balance, position }
}

async function accountId(tx: Tx, context: ValuationContext, code: string): Promise<string> {
  const account = await tx.ledgerAccount.findUnique({
    where: { tenantId_code_currency: { tenantId: context.tenantId, code, currency: context.currency } },
  })
  if (!account) {
    throw new AppError(409, `Mapped ledger account ${code} (${context.currency}) no longer exists; save the valuation setup again.`)
  }
  return account.id
}

async function persistBalance(
  tx: Tx,
  context: { tenantId: string; product: { id: string }; currency: string },
  previous: { id: string; onHandQuantity: number } | null,
  next: InventoryCostPosition,
): Promise<void> {
  if (previous) {
    const updated = await tx.inventoryValuationBalance.updateMany({
      where: { id: previous.id, tenantId: context.tenantId, onHandQuantity: previous.onHandQuantity },
      data: {
        onHandQuantity: next.onHandQuantity,
        inventoryValue: next.inventoryValue.toDecimalString(),
      },
    })
    if (updated.count !== 1) {
      throw new AppError(409, 'Inventory valuation changed concurrently. Retry the stock movement so cost is allocated once.')
    }
    return
  }
  try {
    await tx.inventoryValuationBalance.create({
      data: {
        tenantId: context.tenantId,
        productId: context.product.id,
        currency: context.currency,
        onHandQuantity: next.onHandQuantity,
        inventoryValue: next.inventoryValue.toDecimalString(),
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'Inventory valuation changed concurrently. Retry the stock movement so cost is allocated once.')
    }
    throw error
  }
}

function receiptOffsetCode(reason: InventoryCostReason): string | null {
  switch (reason) {
    case 'PURCHASE_RECEIPT': return 'goodsReceivedNotInvoiced'
    case 'CUSTOMER_RETURN': return 'costOfGoodsSold'
    case 'OPENING_BALANCE': return null
    default: return 'adjustmentGain'
  }
}

function issueOffsetCode(reason: InventoryCostReason): string {
  switch (reason) {
    case 'SUPPLIER_RETURN': return 'goodsReceivedNotInvoiced'
    case 'SALE':
    case 'CONSUMPTION': return 'costOfGoodsSold'
    default: return 'adjustmentExpense'
  }
}

/**
 * Ensure the dedicated opening-equity account exists for a currency. Callers that establish an
 * opening stock position inside an existing transaction use this instead of inventing a P&L
 * offset. It is created only on demand; no seeded chart-of-accounts codes exist.
 */
export async function ensureInventoryOpeningEquity(tx: Tx, tenantId: string, currency: string): Promise<string> {
  const existing = await tx.ledgerAccount.findUnique({
    where: { tenantId_code_currency: { tenantId, code: OPENING_EQUITY_CODE, currency } },
  })
  if (existing) {
    if (existing.kind !== 'EQUITY') {
      throw new AppError(
        409,
        `Ledger account ${OPENING_EQUITY_CODE} (${currency}) already exists as ${existing.kind}; inventory opening value must post to an equity account. Use a different code or correct the existing account.`,
      )
    }
    return existing.id
  }
  const created = await tx.ledgerAccount.create({
    data: { tenantId, code: OPENING_EQUITY_CODE, name: 'Inventory opening equity', kind: 'EQUITY', currency },
  })
  return created.id
}

/**
 * Value an inbound movement that already exists in the quantity ledger. Callers must have created
 * the movement in the same transaction; `quantities` must be positive.
 */
export async function postValuedReceipt(tx: Tx, input: {
  tenantId: string
  productId: string
  stockMovementId: string | null
  quantity: number
  unitCost: string
  /** Currency the caller entered the cost in; must match the product/workspace valuation currency. */
  unitCostCurrency?: string
  reason: InventoryCostReason
  postedAt: Date
  actorId: string | null
  /** Opening valuation already existed in quantity form, so it must not post a new journal here. */
  postJournal?: boolean
  /** Explicit offset account (for example opening equity) instead of the reason-derived one. */
  offsetAccountCode?: string
  /** Explicit offset account id, for accounts outside the valuation mapping (opening equity). */
  offsetAccountId?: string
}): Promise<{ eventId: string; journalEntryId: string | null; value: string }> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new AppError(400, 'A valued receipt quantity must be a positive whole number')
  }
  const context = await loadContext(tx, input.tenantId, input.productId)
  if (input.unitCostCurrency && input.unitCostCurrency !== context.currency) {
    throw new AppError(
      409,
      `The acquisition cost is in ${input.unitCostCurrency} but this product is valued in ${context.currency}. Record the cost in the valuation currency or change the product currency first.`,
    )
  }
  let unitCost: Money
  try {
    unitCost = Money.fromDecimal(input.unitCost, context.currency)
  } catch {
    throw new AppError(400, `The unit cost is not exact in ${context.currency}`)
  }
  if (unitCost.isNegative()) throw new AppError(400, 'A unit cost cannot be negative')
  const receiptValue = unitCost.multiply(input.quantity, 'HALF_UP')

  const { balance, position } = await loadPosition(tx, context)
  const sourceLayerId = input.stockMovementId ?? randomUUID()
  let result
  try {
    result = receiveInventoryCost({
      method: context.method,
      position,
      quantity: input.quantity,
      value: receiptValue,
      sourceLayerId,
      receivedAt: input.postedAt,
    })
  } catch (error) {
    if (error instanceof RangeError) throw new AppError(409, error.message)
    throw error
  }

  await persistBalance(tx, context, balance, result.position)

  if (context.method === 'FIFO') {
    const added = result.position.layers.find(layer => layer.id === sourceLayerId)
    if (!added) throw new AppError(409, 'The FIFO receipt layer was not created. Retry the stock movement.')
    await tx.inventoryCostLayer.create({
      data: {
        id: added.id,
        tenantId: context.tenantId,
        productId: context.product.id,
        sourceMovementId: input.stockMovementId,
        currency: context.currency,
        originalQuantity: input.quantity,
        remainingQuantity: input.quantity,
        originalValue: receiptValue.toDecimalString(),
        remainingValue: receiptValue.toDecimalString(),
        receivedAt: input.postedAt,
      },
    })
  }

  const event = await tx.inventoryValuationEvent.create({
    data: {
      tenantId: context.tenantId,
      productId: context.product.id,
      stockMovementId: input.stockMovementId,
      costingMethod: context.method,
      reason: input.reason,
      quantityDelta: input.quantity,
      costValue: receiptValue.toDecimalString(),
      currency: context.currency,
      postedAt: input.postedAt,
    },
  })

  let journalEntryId: string | null = null
  const shouldPost = input.postJournal !== false && receiptValue.isPositive()
  const offsetCode = input.offsetAccountCode
    ?? (receiptOffsetCode(input.reason) ? context.mapping[roleField(receiptOffsetCode(input.reason) as AccountRole)] : null)
  if (shouldPost && (offsetCode || input.offsetAccountId)) {
    const inventoryAccountId = await accountId(tx, context, context.mapping.inventoryAssetAccountCode)
    const offsetAccountId = input.offsetAccountId ?? await accountId(tx, context, offsetCode!)
    journalEntryId = await recordInventoryJournal(tx, {
      tenantId: context.tenantId,
      currency: context.currency,
      workspaceCurrency: context.workspaceCurrency,
      amount: receiptValue.toDecimalString(),
      postedAt: input.postedAt,
      actorId: input.actorId,
      sourceType: 'INVENTORY_RECEIPT',
      description: `Inventory receipt — ${context.product.sku} (${input.reason})`,
      lines: [
        { accountId: inventoryAccountId, side: 'DEBIT' },
        { accountId: offsetAccountId, side: 'CREDIT' },
      ],
    })
    await tx.inventoryValuationEvent.update({ where: { id: event.id }, data: { journalEntryId } })
  }

  return { eventId: event.id, journalEntryId, value: receiptValue.toDecimalString() }
}

/** Value an outbound movement that already exists in the quantity ledger. */
export async function postValuedIssue(tx: Tx, input: {
  tenantId: string
  productId: string
  stockMovementId: string
  quantity: number
  reason: InventoryCostReason
  postedAt: Date
  actorId: string | null
}): Promise<{ eventId: string; journalEntryId: string | null; value: string; currency: string }> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new AppError(400, 'A valued issue quantity must be a positive whole number')
  }
  const context = await loadContext(tx, input.tenantId, input.productId)
  const { balance, position } = await loadPosition(tx, context)

  if (input.quantity > position.onHandQuantity) {
    const unvalued = position.onHandQuantity === 0
      ? ' No units of this product have an established cost yet.'
      : ''
    throw new AppError(
      409,
      `Only ${position.onHandQuantity} unit(s) of this product carry a cost.${unvalued} Record an opening valuation for the remaining stock before issuing it.`,
    )
  }

  let result
  try {
    result = issueInventoryCost({ method: context.method, position, quantity: input.quantity })
  } catch (error) {
    if (error instanceof RangeError) throw new AppError(409, error.message)
    throw error
  }

  await persistBalance(tx, context, balance, result.position)

  if (context.method === 'FIFO') {
    const layers = await tx.inventoryCostLayer.findMany({
      where: { tenantId: context.tenantId, productId: context.product.id, id: { in: result.allocations.map(allocation => allocation.layerId) } },
    })
    const byId = new Map(layers.map(layer => [layer.id, layer]))
    for (const allocation of result.allocations) {
      const layer = byId.get(allocation.layerId)
      if (!layer) throw new AppError(409, 'A FIFO cost layer disappeared during the issue. Retry the movement.')
      const updated = await tx.inventoryCostLayer.updateMany({
        where: { id: layer.id, tenantId: context.tenantId, remainingQuantity: layer.remainingQuantity },
        data: {
          remainingQuantity: layer.remainingQuantity - allocation.quantity,
          remainingValue: Money.fromDecimal(layer.remainingValue.toString(), context.currency)
            .subtract(allocation.value)
            .toDecimalString(),
        },
      })
      if (updated.count !== 1) {
        throw new AppError(409, 'FIFO cost layers changed concurrently. Retry the stock movement so cost is allocated once.')
      }
    }
  }

  const event = await tx.inventoryValuationEvent.create({
    data: {
      tenantId: context.tenantId,
      productId: context.product.id,
      stockMovementId: input.stockMovementId,
      costingMethod: context.method,
      reason: input.reason,
      quantityDelta: -input.quantity,
      costValue: result.issueValue.toDecimalString(),
      currency: context.currency,
      postedAt: input.postedAt,
    },
  })

  if (context.method === 'FIFO' && result.allocations.length > 0) {
    await tx.inventoryCostAllocation.createMany({
      data: result.allocations.map(allocation => ({
        tenantId: context.tenantId,
        eventId: event.id,
        layerId: allocation.layerId,
        quantity: allocation.quantity,
        value: allocation.value.toDecimalString(),
      })),
    })
  }

  let journalEntryId: string | null = null
  if (result.issueValue.isPositive()) {
    const inventoryAccountId = await accountId(tx, context, context.mapping.inventoryAssetAccountCode)
    const offsetAccountId = await accountId(tx, context, context.mapping[roleField(issueOffsetCode(input.reason) as AccountRole)])
    journalEntryId = await recordInventoryJournal(tx, {
      tenantId: context.tenantId,
      currency: context.currency,
      workspaceCurrency: context.workspaceCurrency,
      amount: result.issueValue.toDecimalString(),
      postedAt: input.postedAt,
      actorId: input.actorId,
      sourceType: 'INVENTORY_ISSUE',
      description: `Inventory issue — ${context.product.sku} (${input.reason})`,
      lines: [
        { accountId: offsetAccountId, side: 'DEBIT' },
        { accountId: inventoryAccountId, side: 'CREDIT' },
      ],
    })
    await tx.inventoryValuationEvent.update({ where: { id: event.id }, data: { journalEntryId } })
  }

  return { eventId: event.id, journalEntryId, value: result.issueValue.toDecimalString(), currency: context.currency }
}

/**
 * Restore the exact quantity and value removed by a sale issue. The reversal is a new positive
 * valuation event and, for FIFO, a new return layer at the original issue's total value. It does
 * not recompute a rounded unit cost from today's position, which would manufacture cost.
 *
 * The journal reversal flips the original issue's exact lines and accounts. `journalEntryId` on
 * the reversal event points at that reversal entry, so the return remains traceable without
 * reusing the invoice recognition or issue journal links.
 */
export async function reverseValuedSaleIssue(tx: Tx, input: {
  tenantId: string
  productId: string
  originalStockMovementId: string
  originalValuationEventId: string
  reversalStockMovementId: string
  quantity: number
  postedAt: Date
  actorId: string | null
  reason: string
}): Promise<{ eventId: string; journalEntryId: string | null; value: string; currency: string }> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new AppError(400, 'A sale reversal quantity must be a positive whole number')
  }
  const event = await tx.inventoryValuationEvent.findFirst({
    where: {
      id: input.originalValuationEventId,
      tenantId: input.tenantId,
      productId: input.productId,
      stockMovementId: input.originalStockMovementId,
    },
  })
  if (!event) {
    throw new AppError(409, 'The original sale valuation event is missing and the inventory cost cannot be restored')
  }
  if (event.reason !== 'SALE') {
    throw new AppError(409, `Only a sale issue can be reversed here; the original event is ${event.reason}`)
  }
  if (event.quantityDelta !== -input.quantity) {
    throw new AppError(409, 'The sale reversal quantity does not match the original issue')
  }
  if (!event.stockMovementId || !event.currency) {
    throw new AppError(409, 'The original sale valuation event is incomplete and cannot be reversed')
  }

  const context = await loadContext(tx, input.tenantId, input.productId)
  if (context.currency !== event.currency) {
    throw new AppError(
      409,
      `The original sale was valued in ${event.currency}, but this product is now valued in ${context.currency}. Resolve the currency change before reversing the sale.`,
    )
  }
  if (context.method !== event.costingMethod) {
    throw new AppError(
      409,
      `The original sale used ${event.costingMethod}, but the workspace now uses ${context.method}. Resolve the costing-method change before reversing the sale.`,
    )
  }

  let originalValue: Money
  try {
    originalValue = Money.fromDecimal(event.costValue.toString(), event.currency)
  } catch {
    throw new AppError(409, 'The original sale value is not exact in its recorded currency and cannot be reversed')
  }
  if (originalValue.isNegative()) {
    throw new AppError(409, 'The original sale value is negative and cannot be reversed')
  }

  const { balance, position } = await loadPosition(tx, context)
  if (!balance) {
    throw new AppError(409, 'No valuation balance exists for this product; the original sale cannot be restored')
  }

  let result
  try {
    result = receiveInventoryCost({
      method: context.method,
      position,
      quantity: input.quantity,
      value: originalValue,
      sourceLayerId: input.reversalStockMovementId,
      receivedAt: input.postedAt,
    })
  } catch (error) {
    if (error instanceof RangeError) throw new AppError(409, error.message)
    throw error
  }

  await persistBalance(tx, context, balance, result.position)

  if (context.method === 'FIFO') {
    const added = result.position.layers.find(layer => layer.id === input.reversalStockMovementId)
    if (!added) throw new AppError(409, 'The sale-return FIFO layer was not created. Retry the reversal.')
    await tx.inventoryCostLayer.create({
      data: {
        id: added.id,
        tenantId: context.tenantId,
        productId: context.product.id,
        sourceMovementId: input.reversalStockMovementId,
        currency: context.currency,
        originalQuantity: input.quantity,
        remainingQuantity: input.quantity,
        originalValue: originalValue.toDecimalString(),
        remainingValue: originalValue.toDecimalString(),
        receivedAt: input.postedAt,
      },
    })
  }

  let journalEntryId: string | null = null
  if (event.journalEntryId) {
    journalEntryId = await reverseInventoryIssueJournal(tx, {
      tenantId: input.tenantId,
      journalEntryId: event.journalEntryId,
      postedAt: input.postedAt,
      actorId: input.actorId,
      reason: input.reason,
    })
  }

  const reversalEvent = await tx.inventoryValuationEvent.create({
    data: {
      tenantId: context.tenantId,
      productId: context.product.id,
      stockMovementId: input.reversalStockMovementId,
      journalEntryId,
      costingMethod: context.method,
      reason: 'CUSTOMER_RETURN',
      quantityDelta: input.quantity,
      costValue: originalValue.toDecimalString(),
      currency: context.currency,
      postedAt: input.postedAt,
    },
  })

  return {
    eventId: reversalEvent.id,
    journalEntryId,
    value: originalValue.toDecimalString(),
    currency: context.currency,
  }
}

/**
 * Establish cost for the unvalued part of a product's on-hand quantity. This does not create a
 * stock movement; it assigns a valued opening layer/balance and posts the first inventory control
 * balance against dedicated opening equity. That journal is the reason a workspace must choose
 * this path before (or instead of) the separate Finance opening-trial-balance flow, which requires
 * an unused ledger.
 */
export async function postInventoryOpeningValuation(
  prisma: PrismaClient,
  tenantId: string,
  input: { productId: string; unitCost: string; asOf: string },
  actorId: string,
): Promise<{ productId: string; quantity: number; value: string; journalEntryId: string }> {
  return prisma.$transaction(async tx => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, tenantId },
      select: { id: true, sku: true, name: true, currency: true, stock: true },
    })
    if (!product) throw new AppError(404, 'Product not found')
    if (product.stock <= 0) throw new AppError(409, 'This product has no on-hand quantity to value')
    const financeOpening = await tx.journalEntry.count({ where: { tenantId, sourceType: 'OPENING_BALANCE' } })
    if (financeOpening > 0) {
      throw new AppError(
        409,
        'A Finance opening balance is already posted. Inventory opening value must be included in that opening or recorded as a reviewed post-opening adjustment; a second opening position is not allowed.',
      )
    }

    const context = await loadContext(tx, tenantId, product.id)
    const { balance: existing, position } = await loadPosition(tx, context)
    if (existing && existing.currency !== context.currency) {
      throw new AppError(
        409,
        `This product already carries value in ${existing.currency}; it cannot be opened in ${context.currency}.`,
      )
    }
    const valuedQuantity = existing?.onHandQuantity ?? 0
    if (valuedQuantity > product.stock) {
      throw new AppError(
        409,
        `The valuation balance covers ${valuedQuantity} unit(s) but only ${product.stock} are on hand. Resolve the stock discrepancy before valuing the opening position.`,
      )
    }
    const openingQuantity = product.stock - valuedQuantity
    if (openingQuantity <= 0) {
      throw new AppError(409, 'This product already has a fully valued on-hand quantity')
    }

    let unitCost: Money
    try { unitCost = Money.fromDecimal(input.unitCost, context.currency) } catch {
      throw new AppError(400, `The unit cost is not exact in ${context.currency}`)
    }
    if (unitCost.isNegative()) throw new AppError(400, 'A unit cost cannot be negative')
    const value = unitCost.multiply(openingQuantity, 'HALF_UP')
    if (!value.isPositive()) {
      throw new AppError(400, 'An opening valuation must have a positive value; a zero-cost position cannot post to the ledger')
    }
    const postedAt = new Date(`${input.asOf}T00:00:00.000Z`)
    if (!Number.isFinite(postedAt.getTime())) throw new AppError(400, 'The opening valuation date is invalid')

    const inventoryAccountId = await accountId(tx, context, context.mapping.inventoryAssetAccountCode)
    const equityAccountId = await ensureInventoryOpeningEquity(tx, tenantId, context.currency)

    const journalEntryId = await recordInventoryJournal(tx, {
      tenantId,
      currency: context.currency,
      workspaceCurrency: context.workspaceCurrency,
      amount: value.toDecimalString(),
      postedAt,
      actorId,
      sourceType: 'INVENTORY_RECEIPT',
      description: `Inventory opening valuation — ${product.sku}`,
      lines: [
        { accountId: inventoryAccountId, side: 'DEBIT' },
        { accountId: equityAccountId, side: 'CREDIT' },
      ],
    })

    // Preserve any value already established for earlier movements; the opening only adds cost
    // for the quantity that has none. Running the domain receipt also validates that an existing
    // FIFO layer set is consistent with its balance before the new layer is written.
    let openingReceipt
    const sourceLayerId = randomUUID()
    try {
      openingReceipt = receiveInventoryCost({
        method: context.method,
        position,
        quantity: openingQuantity,
        value,
        sourceLayerId,
        receivedAt: postedAt,
      })
    } catch (error) {
      if (error instanceof RangeError) throw new AppError(409, error.message)
      throw error
    }
    await persistBalance(tx, context, existing, openingReceipt.position)

    if (context.method === 'FIFO') {
      const added = openingReceipt.position.layers.find(layer => layer.id === sourceLayerId)
      if (!added) throw new AppError(409, 'The opening FIFO layer was not created. Retry the opening valuation.')
      await tx.inventoryCostLayer.create({
        data: {
          id: added.id,
          tenantId,
          productId: product.id,
          sourceMovementId: null,
          currency: context.currency,
          originalQuantity: openingQuantity,
          remainingQuantity: openingQuantity,
          originalValue: value.toDecimalString(),
          remainingValue: value.toDecimalString(),
          receivedAt: postedAt,
        },
      })
    }

    await tx.inventoryValuationEvent.create({
      data: {
        tenantId,
        productId: product.id,
        stockMovementId: null,
        journalEntryId,
        costingMethod: context.method,
        reason: 'OPENING_BALANCE',
        quantityDelta: openingQuantity,
        costValue: value.toDecimalString(),
        currency: context.currency,
        postedAt,
      },
    })

    await recordAuditLog(tx, {
      tenantId,
      actorId,
      action: 'inventory.valuation.opening',
      targetType: 'Product',
      targetId: product.id,
      metadata: { quantity: openingQuantity, unitCost: unitCost.toDecimalString(), value: value.toDecimalString(), currency: context.currency, journalEntryId },
    })

    return { productId: product.id, quantity: openingQuantity, value: value.toDecimalString(), journalEntryId }
  })
}

interface RawMovementRow {
  currency: string | null
  movementCount: number | bigint
  quantity: number | bigint | null
}

interface RawEventValueRow {
  currency: string
  postedValue: Prisma.Decimal | null
  unpostedValue: Prisma.Decimal | null
}

export async function getInventoryValuationReport(prisma: PrismaClient, tenantId: string): Promise<InventoryValuationReport> {
  const setup = await readSetup(prisma, tenantId)
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')

  const [productGroups, balanceGroups, eventValueRows, unvaluedRows] = await Promise.all([
    prisma.product.groupBy({
      by: ['currency'],
      where: { tenantId },
      _sum: { stock: true },
      _count: { _all: true },
    }),
    prisma.inventoryValuationBalance.groupBy({
      by: ['currency'],
      where: { tenantId },
      _sum: { onHandQuantity: true, inventoryValue: true },
    }),
    // Cost values are stored positive; the quantity delta carries the direction. Summing raw
    // `costValue` would add issues back into the posted balance, so net them by direction.
    prisma.$queryRaw<RawEventValueRow[]>`
      SELECT "currency" AS "currency",
             COALESCE(SUM(
               CASE WHEN "journalEntryId" IS NOT NULL
                    THEN CASE WHEN "quantityDelta" < 0 THEN -"costValue" ELSE "costValue" END
                    ELSE 0 END
             ), 0) AS "postedValue",
             COALESCE(SUM(
               CASE WHEN "journalEntryId" IS NULL
                    THEN CASE WHEN "quantityDelta" < 0 THEN -"costValue" ELSE "costValue" END
                    ELSE 0 END
             ), 0) AS "unpostedValue"
      FROM "InventoryValuationEvent"
      WHERE "tenantId" = ${tenantId}
      GROUP BY "currency"
    `,
    prisma.$queryRaw<RawMovementRow[]>`
      SELECT product."currency" AS "currency",
             COUNT(*) AS "movementCount",
             COALESCE(SUM(movement."delta"), 0) AS "quantity"
      FROM "StockMovement" movement
      JOIN "Product" product
        ON product."id" = movement."productId" AND product."tenantId" = movement."tenantId"
      LEFT JOIN "InventoryValuationEvent" valuation
        ON valuation."stockMovementId" = movement."id" AND valuation."tenantId" = movement."tenantId"
      WHERE movement."tenantId" = ${tenantId} AND valuation."id" IS NULL
      GROUP BY product."currency"
    `,
  ])

  const currencies = new Set<string>()
  for (const group of productGroups) currencies.add(group.currency ?? tenant.currency)
  for (const group of balanceGroups) currencies.add(group.currency)
  for (const group of eventValueRows) currencies.add(group.currency)
  for (const mapping of setup.mappings) currencies.add(mapping.currency)

  const mappingByCurrency = new Map(setup.mappings.map(mapping => [mapping.currency, mapping]))

  const report = await Promise.all([...currencies].sort().map(async currency => {
    const productGroup = productGroups.find(group => (group.currency ?? tenant.currency) === currency)
    const balanceGroup = balanceGroups.find(group => group.currency === currency)
    const eventValueRow = eventValueRows.find(row => row.currency === currency)
    const unvaluedRow = unvaluedRows.find(row => (row.currency ?? tenant.currency) === currency)

    const quantityOnHand = Number(productGroup?._sum.stock ?? 0)
    const valuedQuantity = Number(balanceGroup?._sum.onHandQuantity ?? 0)
    const unvaluedQuantity = Math.max(0, quantityOnHand - valuedQuantity)
    const valuedQuantityExceedsOnHand = valuedQuantity > quantityOnHand
    const inventoryValue = new Prisma.Decimal(balanceGroup?._sum.inventoryValue?.toString() ?? '0')
    const postedValue = new Prisma.Decimal(eventValueRow?.postedValue?.toString() ?? '0')
    const unpostedValue = new Prisma.Decimal(eventValueRow?.unpostedValue?.toString() ?? '0')

    let ledgerAssetBalance = new Prisma.Decimal(0)
    const mapping = mappingByCurrency.get(currency)
    if (mapping) {
      const rows = await prisma.$queryRaw<Array<{ balance: Prisma.Decimal | null }>>`
        SELECT COALESCE(SUM(CASE WHEN line."side" = 'DEBIT' THEN line."amount" ELSE -line."amount" END), 0) AS "balance"
        FROM "JournalLine" line
        JOIN "JournalEntry" entry
          ON entry."id" = line."entryId" AND entry."tenantId" = line."tenantId"
        JOIN "LedgerAccount" account
          ON account."id" = line."accountId" AND account."tenantId" = line."tenantId"
        WHERE line."tenantId" = ${tenantId}
          AND account."currency" = ${currency}
          AND account."code" = ${mapping.accounts.inventoryAsset.code}
      `
      ledgerAssetBalance = new Prisma.Decimal(rows[0]?.balance?.toString() ?? '0')
    }

    const ledgerDifference = postedValue.minus(ledgerAssetBalance)
    const subledgerDifference = inventoryValue.minus(postedValue).minus(unpostedValue)
    const unvaluedMovementCount = Number(unvaluedRow?.movementCount ?? 0)

    return {
      currency,
      productCount: productGroup?._count._all ?? 0,
      quantityOnHand,
      valuedQuantity,
      unvaluedQuantity,
      inventoryValue: inventoryValue.toFixed(4),
      postedValue: postedValue.toFixed(4),
      unpostedValue: unpostedValue.toFixed(4),
      ledgerAssetBalance: ledgerAssetBalance.toFixed(4),
      ledgerDifference: ledgerDifference.toFixed(4),
      subledgerDifference: subledgerDifference.toFixed(4),
      unvaluedMovementCount,
      reconciled: setup.configured
        && unvaluedQuantity === 0
        && !valuedQuantityExceedsOnHand
        && unpostedValue.isZero()
        && ledgerDifference.isZero()
        && subledgerDifference.isZero(),
    }
  }))

  return {
    configured: setup.configured,
    costingMethod: setup.costingMethod,
    currencies: report,
  }
}

/** Products whose on-hand quantity has no established cost; used by the opening-valuation UI. */
export async function listUnvaluedProducts(prisma: PrismaClient, tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const products = await prisma.product.findMany({
    where: { tenantId, stock: { gt: 0 } },
    select: {
      id: true, name: true, sku: true, stock: true, currency: true, archivedAt: true,
      valuationBalance: { select: { onHandQuantity: true, inventoryValue: true, currency: true } },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
  return products
    .filter(product => (product.valuationBalance?.onHandQuantity ?? 0) < product.stock)
    .map(product => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      stock: product.stock,
      valuedQuantity: product.valuationBalance?.onHandQuantity ?? 0,
      unvaluedQuantity: product.stock - (product.valuationBalance?.onHandQuantity ?? 0),
      currency: product.valuationBalance?.currency ?? product.currency ?? tenant.currency,
      archivedAt: product.archivedAt?.toISOString() ?? null,
    }))
}
