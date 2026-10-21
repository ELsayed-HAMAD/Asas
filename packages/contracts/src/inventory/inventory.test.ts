import { describe, expect, it } from 'vitest'
import { productListQuerySchema, purchaseOrderSchema } from './inventory.js'

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
})
