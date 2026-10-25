import { describe, expect, it } from 'vitest'
import { Money } from '../money/money.js'
import { issueInventoryCost, receiveInventoryCost, type InventoryCostPosition } from './costing.js'

const value = (amount: string) => Money.fromDecimal(amount, 'USD')
const empty = (): InventoryCostPosition => ({ onHandQuantity: 0, inventoryValue: value('0.00'), layers: [] })

describe('inventory costing', () => {
  it('values FIFO issues from the oldest layer first and preserves exact layer balances', () => {
    const first = receiveInventoryCost({ method: 'FIFO', position: empty(), quantity: 3, value: value('10.00'), sourceLayerId: 'receipt-a', receivedAt: new Date('2026-01-01T00:00:00Z') }).position
    const position = receiveInventoryCost({ method: 'FIFO', position: first, quantity: 2, value: value('10.00'), sourceLayerId: 'receipt-b', receivedAt: new Date('2026-02-01T00:00:00Z') }).position
    const result = issueInventoryCost({ method: 'FIFO', position, quantity: 4 })

    expect(result.issueValue.toDecimalString()).toBe('15.00')
    expect(result.allocations.map(allocation => [allocation.layerId, allocation.quantity, allocation.value.toDecimalString()])).toEqual([
      ['receipt-a', 3, '10.00'], ['receipt-b', 1, '5.00'],
    ])
    expect(result.position).toMatchObject({ onHandQuantity: 1, inventoryValue: value('5.00'), layers: [{ id: 'receipt-b', remainingQuantity: 1, remainingValue: value('5.00') }] })
  })

  it('uses a deterministic receipt-date and ID order for FIFO layers with tied timestamps', () => {
    let position = receiveInventoryCost({ method: 'FIFO', position: empty(), quantity: 1, value: value('4.00'), sourceLayerId: 'b', receivedAt: new Date('2026-01-01T00:00:00Z') }).position
    position = receiveInventoryCost({ method: 'FIFO', position, quantity: 1, value: value('7.00'), sourceLayerId: 'a', receivedAt: new Date('2026-01-01T00:00:00Z') }).position
    const result = issueInventoryCost({ method: 'FIFO', position, quantity: 1 })

    expect(result.allocations).toEqual([{ layerId: 'a', quantity: 1, value: value('7.00') }])
  })

  it('calculates weighted-average issues in integer minor units and uses the residual on full depletion', () => {
    let position = receiveInventoryCost({ method: 'WEIGHTED_AVERAGE', position: empty(), quantity: 3, value: value('10.00'), sourceLayerId: 'receipt-a', receivedAt: new Date('2026-01-01T00:00:00Z') }).position
    position = receiveInventoryCost({ method: 'WEIGHTED_AVERAGE', position, quantity: 2, value: value('10.00'), sourceLayerId: 'receipt-b', receivedAt: new Date('2026-02-01T00:00:00Z') }).position

    const partial = issueInventoryCost({ method: 'WEIGHTED_AVERAGE', position, quantity: 1 })
    expect(partial.issueValue.toDecimalString()).toBe('4.00')
    expect(partial.position).toMatchObject({ onHandQuantity: 4, inventoryValue: value('16.00') })
    const final = issueInventoryCost({ method: 'WEIGHTED_AVERAGE', position: partial.position, quantity: 4 })
    expect(final.issueValue.toDecimalString()).toBe('16.00')
    expect(final.position).toMatchObject({ onHandQuantity: 0, inventoryValue: value('0.00') })
  })

  it('rejects negative stock, inconsistent FIFO layers, invalid amounts, and mixed currencies', () => {
    expect(() => issueInventoryCost({ method: 'FIFO', position: empty(), quantity: 1 })).toThrow(/exceeds available/)
    expect(() => receiveInventoryCost({ method: 'FIFO', position: empty(), quantity: 1, value: value('-1.00'), sourceLayerId: 'receipt-a', receivedAt: new Date() })).toThrow(/cannot be negative/)
    expect(() => receiveInventoryCost({ method: 'FIFO', position: empty(), quantity: 1, value: Money.fromDecimal('1.00', 'EUR'), sourceLayerId: 'receipt-a', receivedAt: new Date() })).toThrow(/currencies must match/)
    expect(() => issueInventoryCost({ method: 'FIFO', position: { ...empty(), onHandQuantity: 1 }, quantity: 1 })).toThrow(/layer quantities do not reconcile/)
  })

  it('rejects duplicate source layers and quantities beyond the database Int range', () => {
    const received = receiveInventoryCost({ method: 'FIFO', position: empty(), quantity: 1, value: value('1.00'), sourceLayerId: 'receipt-a', receivedAt: new Date() }).position
    expect(() => receiveInventoryCost({ method: 'FIFO', position: received, quantity: 1, value: value('1.00'), sourceLayerId: 'receipt-a', receivedAt: new Date() })).toThrow(/already exists/)
    expect(() => receiveInventoryCost({ method: 'WEIGHTED_AVERAGE', position: { ...empty(), onHandQuantity: 2_147_483_647 }, quantity: 1, value: value('1.00'), sourceLayerId: 'receipt-b', receivedAt: new Date() })).toThrow(/exceed/)
  })

  it('does not silently reinterpret FIFO layer state as weighted average', () => {
    const fifo = receiveInventoryCost({ method: 'FIFO', position: empty(), quantity: 1, value: value('1.00'), sourceLayerId: 'receipt-a', receivedAt: new Date() }).position
    expect(() => issueInventoryCost({ method: 'WEIGHTED_AVERAGE', position: fifo, quantity: 1 })).toThrow(/cannot contain FIFO/)
  })
})
