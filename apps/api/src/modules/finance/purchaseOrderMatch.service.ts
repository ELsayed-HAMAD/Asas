import { Prisma, type PrismaClient } from '@prisma/client'
import { Money } from '@asas/domain'
import type { PayablePurchaseOrderCandidate } from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

/**
 * Exact supplier-invoice / purchase-receipt matching.
 *
 * The first slice deliberately supports one full receipt on one single-line purchase order with
 * a Finance vendor. A match clears the exact GRNI account credited by that receipt journal. It
 * does not split a bill, allocate a price/tax/freight variance, or invent a value for a
 * quantity-only receipt. Those cases remain visibly unsupported rather than being approximated.
 */

type MatchClient = PrismaClient | Prisma.TransactionClient

export interface PurchaseOrderMatchEvidence {
  purchaseOrderId: string
  valuationEventId: string
  journalEntryId: string
  grniAccountId: string
  amount: string
  currency: string
  productName: string
  sku: string
  quantity: number
  receivedAt: Date
}

interface PurchaseOrderEvidenceInput {
  tenantId: string
  purchaseOrder: Prisma.PurchaseOrderGetPayload<{
    include: {
      lines: { include: { product: { select: { name: true; sku: true } } } }
      valuationEvents: {
        include: {
          journalEntry: { include: { lines: { include: { account: true } }; reversedBy: { select: { id: true } } } }
        }
      }
      invoiceMatches: { select: { id: true; status: true } }
    }
  }>
}

function buildEvidence(input: PurchaseOrderEvidenceInput): PurchaseOrderMatchEvidence {
  const { tenantId, purchaseOrder } = input
  if (purchaseOrder.status !== 'RECEIVED') {
    throw new AppError(409, 'Only a received purchase order can be matched to a supplier bill')
  }
  if (!purchaseOrder.vendorId) {
    throw new AppError(409, 'This purchase order has no Finance vendor, so it cannot be matched to a supplier bill')
  }
  if (purchaseOrder.lines.length !== 1) {
    throw new AppError(409, 'Exact matching currently supports single-line purchase orders only')
  }
  if (purchaseOrder.invoiceMatches.some(match => match.status === 'ACTIVE')) {
    throw new AppError(409, 'This purchase order is already matched to another supplier bill')
  }

  const line = purchaseOrder.lines[0]!
  const events = purchaseOrder.valuationEvents.filter(event =>
    event.reason === 'PURCHASE_RECEIPT'
    && event.productId === line.productId
    && event.quantityDelta === line.quantity,
  )
  if (events.length !== 1) {
    throw new AppError(
      409,
      events.length === 0
        ? 'This purchase order has no valued receipt to match. Quantity-only receipts cannot clear GRNI.'
        : 'This purchase order has more than one valued receipt. Partial and split receipts are not supported by exact matching.',
    )
  }

  const event = events[0]!
  if (!event.journalEntryId || !event.journalEntry) {
    throw new AppError(409, 'The purchase receipt has no posted GRNI journal to clear')
  }
  if (event.journalEntry.reversedBy) {
    throw new AppError(409, 'The purchase receipt journal has been reversed and cannot be matched')
  }
  if (event.journalEntry.sourceType !== 'INVENTORY_RECEIPT') {
    throw new AppError(409, 'The linked valuation event is not an inventory receipt journal')
  }

  const creditLines = event.journalEntry.lines.filter(journalLine => journalLine.side === 'CREDIT')
  const debitLines = event.journalEntry.lines.filter(journalLine => journalLine.side === 'DEBIT')
  if (creditLines.length !== 1 || debitLines.length !== 1) {
    throw new AppError(409, 'The purchase receipt journal does not have exactly one GRNI credit line')
  }
  const credit = creditLines[0]!
  if (credit.account.tenantId !== tenantId || credit.account.kind !== 'LIABILITY') {
    throw new AppError(409, 'The purchase receipt journal does not carry a tenant liability credit for GRNI')
  }
  if (!credit.amount.eq(event.costValue) || !event.journalEntry.amount.eq(event.costValue)) {
    throw new AppError(409, 'The purchase receipt journal value does not reconcile to its valuation event')
  }
  if (!event.costValue.isPositive() || event.currency !== credit.account.currency) {
    throw new AppError(409, 'The purchase receipt has no positive, currency-consistent GRNI value')
  }

  return {
    purchaseOrderId: purchaseOrder.id,
    valuationEventId: event.id,
    journalEntryId: event.journalEntry.id,
    grniAccountId: credit.accountId,
    amount: event.costValue.toString(),
    currency: event.currency,
    productName: line.product.name,
    sku: line.product.sku,
    quantity: line.quantity,
    receivedAt: purchaseOrder.receivedAt ?? event.postedAt,
  }
}

const evidenceInclude = {
  lines: { include: { product: { select: { name: true, sku: true } } } },
  valuationEvents: {
    include: {
      journalEntry: {
        include: {
          lines: { include: { account: true } },
          reversedBy: { select: { id: true } },
        },
      },
    },
  },
  invoiceMatches: { where: { status: 'ACTIVE' }, select: { id: true, status: true } },
} satisfies Prisma.PurchaseOrderInclude

type EvidenceOrder = Prisma.PurchaseOrderGetPayload<{ include: typeof evidenceInclude }>

function evidenceFromOrder(tenantId: string, order: EvidenceOrder): PurchaseOrderMatchEvidence {
  return buildEvidence({
    tenantId,
    purchaseOrder: order as PurchaseOrderEvidenceInput['purchaseOrder'],
  })
}

/** Validate that a purchase order is the exact, full, valued receipt for this bill. */
export async function resolvePurchaseOrderMatch(
  client: MatchClient,
  input: {
    tenantId: string
    vendorId: string
    purchaseOrderId: string
    invoiceAmount: string
    invoiceCurrency: string
  },
): Promise<PurchaseOrderMatchEvidence> {
  const order = await client.purchaseOrder.findFirst({
    where: { id: input.purchaseOrderId, tenantId: input.tenantId },
    include: evidenceInclude,
  })
  if (!order) throw new AppError(404, 'Purchase order not found')
  if (order.vendorId !== input.vendorId) {
    throw new AppError(409, 'The purchase order vendor does not match this bill vendor')
  }

  const evidence = evidenceFromOrder(input.tenantId, order)
  if (evidence.currency !== input.invoiceCurrency) {
    throw new AppError(409, `The received value is in ${evidence.currency}; the bill must use the same currency for exact matching`)
  }

  let invoiceValue: Money
  let receivedValue: Money
  try {
    invoiceValue = Money.fromDecimal(input.invoiceAmount, input.invoiceCurrency)
    receivedValue = Money.fromDecimal(evidence.amount, evidence.currency)
  } catch {
    throw new AppError(409, 'The bill or receipt amount is not exact in its recorded currency')
  }
  if (!invoiceValue.equals(receivedValue)) {
    throw new AppError(
      409,
      `The bill amount must exactly equal the received value (${evidence.amount} ${evidence.currency}); partial and variance matching are not supported`,
    )
  }
  return evidence
}

/** Create the active match after the AP recognition journal has posted. */
export async function activatePurchaseOrderMatch(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    payableInvoiceId: string
    evidence: PurchaseOrderMatchEvidence
  },
): Promise<void> {
  const active = await tx.purchaseOrderInvoiceMatch.findFirst({
    where: { tenantId: input.tenantId, payableInvoiceId: input.payableInvoiceId, status: 'ACTIVE' },
    select: { purchaseOrderId: true, journalEntryId: true },
  })
  if (active) {
    if (active.purchaseOrderId === input.evidence.purchaseOrderId && active.journalEntryId === input.evidence.journalEntryId) return
    throw new AppError(409, 'This bill already has a different active purchase-order match')
  }
  try {
    await tx.purchaseOrderInvoiceMatch.create({
      data: {
        tenantId: input.tenantId,
        purchaseOrderId: input.evidence.purchaseOrderId,
        payableInvoiceId: input.payableInvoiceId,
        valuationEventId: input.evidence.valuationEventId,
        journalEntryId: input.evidence.journalEntryId,
        activePurchaseOrderId: input.evidence.purchaseOrderId,
        amount: input.evidence.amount,
        currency: input.evidence.currency,
        status: 'ACTIVE',
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'This purchase order was matched by another bill. Reload and try a different receipt.')
    }
    throw error
  }
}

/**
 * Reverse the active match when its bill is rejected, sent back for changes, or voided. The row
 * and its original journal stay as history; only the active uniqueness key is released.
 */
export async function reversePurchaseOrderMatchIfPresent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  payableInvoiceId: string,
): Promise<boolean> {
  const active = await tx.purchaseOrderInvoiceMatch.findFirst({
    where: { tenantId, payableInvoiceId, status: 'ACTIVE' },
    select: { id: true },
  })
  if (!active) return false
  await tx.purchaseOrderInvoiceMatch.update({
    where: { id_tenantId: { id: active.id, tenantId } },
    data: { status: 'REVERSED', activePurchaseOrderId: null, reversedAt: new Date() },
  })
  return true
}

/**
 * Candidates for the bill form. A candidate must have a vendor, exactly one line, and one full
 * valued receipt whose journal still carries an unreversed GRNI liability credit.
 */
export async function listMatchablePurchaseOrders(
  client: MatchClient,
  tenantId: string,
  vendorId: string,
): Promise<PayablePurchaseOrderCandidate[]> {
  const vendor = await client.vendor.findFirst({ where: { id: vendorId, tenantId }, select: { id: true } })
  if (!vendor) throw new AppError(404, 'Vendor not found')

  const orders = await client.purchaseOrder.findMany({
    where: {
      tenantId,
      vendorId,
      status: 'RECEIVED',
      invoiceMatches: { none: { status: 'ACTIVE' } },
    },
    include: evidenceInclude,
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: 100,
  })

  const candidates: PayablePurchaseOrderCandidate[] = []
  for (const order of orders) {
    try {
      const evidence = evidenceFromOrder(tenantId, order)
      const money = Money.fromDecimal(evidence.amount, evidence.currency)
      candidates.push({
        id: evidence.purchaseOrderId,
        productName: evidence.productName,
        sku: evidence.sku,
        quantity: evidence.quantity,
        receivedValue: evidence.amount,
        receivedValueMoney: money.toWire(),
        currency: evidence.currency,
        receivedAt: evidence.receivedAt.toISOString(),
      })
    } catch (error) {
      // A received order with no valued receipt, multiple lines, a reversed receipt, or a value
      // that is not exact in its currency is not a candidate. It remains visible in Inventory so
      // the user can investigate it there rather than receiving an invented or rounded match.
      if (error instanceof AppError || error instanceof RangeError) continue
      throw error
    }
  }
  return candidates
}
