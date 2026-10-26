import { describe, expect, it } from 'vitest'
import {
  productListQuerySchema,
  purchaseOrderSchema,
  purchaseOrderWriteSchema,
  stockMovementWriteSchema,
} from './inventory.js'

describe('productListQuerySchema archived filter', () => {
  it('defaults to active products and parses the explicit archived filter', () => {
    expect(productListQuerySchema.parse({}).archived).toBe(false)
    expect(productListQuerySchema.parse({ archived: 'true' }).archived).toBe(true)
    expect(productListQuerySchema.parse({ archived: 'false' }).archived).toBe(false)
  })

  it('rejects invalid archived query values', () => {
    expect(productListQuerySchema.safeParse({ archived: 'yes' }).success).toBe(false)
  })
})

describe('stockMovementWriteSchema', () => {
  const productId = 'c987654321098765432109876'
  const requestKey = 'cc35b4e1-07ec-4656-a3d3-8b4e71c67251'

  it('requires a client request key so a manual movement retry can be deduplicated', () => {
    expect(stockMovementWriteSchema.safeParse({ productId, delta: 1 }).success).toBe(false)
    expect(stockMovementWriteSchema.safeParse({ productId, delta: 1, requestKey: 'not-a-uuid' }).success).toBe(false)
    expect(stockMovementWriteSchema.parse({ productId, delta: 1, requestKey }).requestKey).toBe(requestKey)
  })

  it('keeps zero movement and valuation fields validated alongside the request key', () => {
    expect(stockMovementWriteSchema.safeParse({ productId, delta: 0, requestKey }).success).toBe(false)
    expect(stockMovementWriteSchema.parse({ productId, delta: -2, requestKey, reason: 'SALE', unitCost: '12.50' }))
      .toMatchObject({ delta: -2, reason: 'SALE', unitCost: '12.50' })
  })
})

describe('purchaseOrderSchema', () => {
  it('parses valid draft purchase orders without approvedAt/receivedAt', () => {
    const parsed = purchaseOrderSchema.parse({
      id: 'c123456789012345678901234',
      status: 'DRAFT',
      createdAt: '2026-10-21T00:00:00.000Z',
      productId: 'c987654321098765432109876',
      productName: 'Widget',
      sku: 'W-01',
      quantity: 5,
    })
    expect(parsed.status).toBe('DRAFT')
    expect(parsed.approvedAt).toBeUndefined()
  })

  it('parses approved and received orders with timestamps', () => {
    const parsed = purchaseOrderSchema.parse({
      id: 'c123456789012345678901234',
      status: 'RECEIVED',
      approvedAt: '2026-10-21T01:00:00.000Z',
      receivedAt: '2026-10-21T02:00:00.000Z',
      createdAt: '2026-10-21T00:00:00.000Z',
      productId: 'c987654321098765432109876',
      productName: 'Widget',
      sku: 'W-01',
      quantity: 10,
    })
    expect(parsed.status).toBe('RECEIVED')
    expect(parsed.receivedAt).toBe('2026-10-21T02:00:00.000Z')
  })

  it('treats a Finance vendor as optional write metadata and returns its display name', () => {
    const productId = 'c987654321098765432109876'
    const vendorId = 'c111111111111111111111111'
    expect(purchaseOrderWriteSchema.parse({ productId, quantity: 1 }).vendorId).toBeUndefined()
    expect(purchaseOrderWriteSchema.parse({ productId, quantity: 1, vendorId }).vendorId).toBe(vendorId)
    expect(purchaseOrderWriteSchema.parse({ productId, quantity: 1, vendorId: null }).vendorId).toBeNull()
    const parsed = purchaseOrderSchema.parse({
      id: 'c123456789012345678901234',
      status: 'RECEIVED',
      createdAt: '2026-10-21T00:00:00.000Z',
      productId,
      productName: 'Widget',
      sku: 'W-01',
      quantity: 10,
      vendorId,
      vendorName: 'Supplier One',
    })
    expect(parsed.vendorId).toBe(vendorId)
    expect(parsed.vendorName).toBe('Supplier One')
  })
})
