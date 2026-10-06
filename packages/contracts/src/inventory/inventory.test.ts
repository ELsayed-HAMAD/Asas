import { describe, expect, it } from 'vitest'
import { productListQuerySchema } from './inventory.js'

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
