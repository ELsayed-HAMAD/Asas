import { Money } from '../money/money.js'
import { makeRational } from '../money/rational.js'

export type InventoryCostingMethod = 'FIFO' | 'WEIGHTED_AVERAGE'

export interface InventoryCostLayer {
  id: string
  receivedAt: Date
  remainingQuantity: number
  remainingValue: Money
}

export interface InventoryCostPosition {
  onHandQuantity: number
  inventoryValue: Money
  /** FIFO only. Weighted-average positions keep their value directly on the position. */
  layers: readonly InventoryCostLayer[]
}

export interface InventoryCostAllocation {
  layerId: string
  quantity: number
  value: Money
}

export interface InventoryReceiptCostResult {
  position: InventoryCostPosition
  receiptValue: Money
}

export interface InventoryIssueCostResult {
  position: InventoryCostPosition
  issueValue: Money
  allocations: InventoryCostAllocation[]
}

const MAX_QUANTITY = 2_147_483_647

function assertQuantity(quantity: number, field: string): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    throw new RangeError(`${field} must be a whole number from 1 to ${MAX_QUANTITY}`)
  }
}

function assertPosition(position: InventoryCostPosition): void {
  if (!Number.isSafeInteger(position.onHandQuantity) || position.onHandQuantity < 0 || position.onHandQuantity > MAX_QUANTITY) {
    throw new RangeError('On-hand quantity is outside the supported inventory range')
  }
  if (position.inventoryValue.isNegative()) throw new RangeError('Inventory value cannot be negative')
}

function assertFifoPosition(position: InventoryCostPosition): void {
  const currency = position.inventoryValue.currency
  const quantity = position.layers.reduce((total, layer) => total + layer.remainingQuantity, 0)
  if (quantity !== position.onHandQuantity) throw new RangeError('FIFO layer quantities do not reconcile to on-hand quantity')
  const value = Money.sum(position.layers.map(layer => {
    if (!Number.isSafeInteger(layer.remainingQuantity) || layer.remainingQuantity <= 0) throw new RangeError('FIFO layers must have positive whole quantities')
    if (!Number.isFinite(layer.receivedAt.getTime())) throw new RangeError('FIFO layer receipt date is invalid')
    if (layer.remainingValue.isNegative()) throw new RangeError('FIFO layer value cannot be negative')
    return layer.remainingValue
  }), currency)
  if (!value.equals(position.inventoryValue)) throw new RangeError('FIFO layer values do not reconcile to inventory value')
  if (new Set(position.layers.map(layer => layer.id)).size !== position.layers.length) throw new RangeError('FIFO layer IDs must be unique')
}

function assertWeightedAveragePosition(position: InventoryCostPosition): void {
  if (position.layers.length > 0) throw new RangeError('Weighted-average positions cannot contain FIFO cost layers')
}

function orderedLayers(layers: readonly InventoryCostLayer[]): InventoryCostLayer[] {
  return [...layers].sort((a, b) => {
    const dateOrder = a.receivedAt.getTime() - b.receivedAt.getTime()
    return dateOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  })
}

/**
 * Add an already-valued receipt to an inventory position. The caller is responsible for
 * deriving eligible acquisition cost (including freight/duties where applicable) and converting
 * it to the position's currency before calling this function.
 */
export function receiveInventoryCost(input: {
  method: InventoryCostingMethod
  position: InventoryCostPosition
  quantity: number
  value: Money
  sourceLayerId: string
  receivedAt: Date
}): InventoryReceiptCostResult {
  assertPosition(input.position)
  assertQuantity(input.quantity, 'Receipt quantity')
  if (input.value.isNegative()) throw new RangeError('Receipt cost cannot be negative')
  if (input.value.currency !== input.position.inventoryValue.currency) throw new RangeError('Receipt and inventory position currencies must match')
  if (!input.sourceLayerId.trim()) throw new RangeError('Receipt source layer ID is required')
  if (!Number.isFinite(input.receivedAt.getTime())) throw new RangeError('Receipt date is invalid')
  const nextQuantity = input.position.onHandQuantity + input.quantity
  if (nextQuantity > MAX_QUANTITY) throw new RangeError('Receipt would exceed the supported on-hand quantity')

  if (input.method === 'FIFO') {
    assertFifoPosition(input.position)
    if (input.position.layers.some(layer => layer.id === input.sourceLayerId)) throw new RangeError('Receipt source layer ID already exists')
    const layer: InventoryCostLayer = {
      id: input.sourceLayerId,
      receivedAt: new Date(input.receivedAt),
      remainingQuantity: input.quantity,
      remainingValue: input.value,
    }
    const position = {
      onHandQuantity: nextQuantity,
      inventoryValue: input.position.inventoryValue.add(input.value),
      layers: [...input.position.layers, layer],
    }
    assertFifoPosition(position)
    return { position, receiptValue: input.value }
  }

  assertWeightedAveragePosition(input.position)
  return {
    position: {
      onHandQuantity: nextQuantity,
      inventoryValue: input.position.inventoryValue.add(input.value),
      layers: [],
    },
    receiptValue: input.value,
  }
}

/** Cost an issue at the selected policy without allowing negative stock or negative valuation. */
export function issueInventoryCost(input: {
  method: InventoryCostingMethod
  position: InventoryCostPosition
  quantity: number
}): InventoryIssueCostResult {
  assertPosition(input.position)
  assertQuantity(input.quantity, 'Issue quantity')
  if (input.quantity > input.position.onHandQuantity) throw new RangeError('Issue quantity exceeds available on-hand stock')

  if (input.method === 'WEIGHTED_AVERAGE') {
    assertWeightedAveragePosition(input.position)
    const issueValue = input.quantity === input.position.onHandQuantity
      ? input.position.inventoryValue
      : input.position.inventoryValue.multiply(makeRational(BigInt(input.quantity), BigInt(input.position.onHandQuantity)), 'HALF_UP')
    return {
      position: {
        onHandQuantity: input.position.onHandQuantity - input.quantity,
        inventoryValue: input.position.inventoryValue.subtract(issueValue),
        layers: [],
      },
      issueValue,
      allocations: [],
    }
  }

  assertFifoPosition(input.position)
  let quantityToIssue = input.quantity
  const allocations: InventoryCostAllocation[] = []
  const layers: InventoryCostLayer[] = []
  for (const layer of orderedLayers(input.position.layers)) {
    if (quantityToIssue === 0) {
      layers.push(layer)
      continue
    }
    const quantity = Math.min(quantityToIssue, layer.remainingQuantity)
    const value = quantity === layer.remainingQuantity
      ? layer.remainingValue
      : layer.remainingValue.multiply(makeRational(BigInt(quantity), BigInt(layer.remainingQuantity)), 'HALF_UP')
    allocations.push({ layerId: layer.id, quantity, value })
    quantityToIssue -= quantity
    const remainingQuantity = layer.remainingQuantity - quantity
    if (remainingQuantity > 0) {
      layers.push({ ...layer, remainingQuantity, remainingValue: layer.remainingValue.subtract(value) })
    }
  }
  if (quantityToIssue !== 0) throw new RangeError('FIFO layers do not contain enough stock for this issue')

  const issueValue = Money.sum(allocations.map(allocation => allocation.value), input.position.inventoryValue.currency)
  const position: InventoryCostPosition = {
    onHandQuantity: input.position.onHandQuantity - input.quantity,
    inventoryValue: input.position.inventoryValue.subtract(issueValue),
    layers,
  }
  assertFifoPosition(position)
  return { position, issueValue, allocations }
}
