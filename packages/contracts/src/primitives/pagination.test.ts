import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationQuerySchema,
  toPrismaPage,
  buildPaginationMeta,
} from './pagination.js'

describe('paginationQuerySchema', () => {
  it('coerces strings to integers with correct defaults', () => {
    const result = paginationQuerySchema.parse({})
    expect(result).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE })

    const stringResult = paginationQuerySchema.parse({ page: '2', limit: '50' })
    expect(stringResult).toEqual({ page: 2, limit: 50 })
  })

  it('enforces limit boundaries', () => {
    expect(() => paginationQuerySchema.parse({ limit: '999' })).toThrow()
    expect(paginationQuerySchema.parse({ limit: '100' }).limit).toBe(MAX_PAGE_SIZE)
  })

  it('rejects decimal strings and invalid inputs', () => {
    expect(() => paginationQuerySchema.parse({ page: '1.5' })).toThrow(/expected int/i)
    expect(() => paginationQuerySchema.parse({ page: '-1' })).toThrow()
    expect(() => paginationQuerySchema.parse({ limit: '0' })).toThrow()
  })
})

describe('pagination helpers', () => {
  it('translates queries to Prisma skip/take correctly', () => {
    expect(toPrismaPage({ page: 1, limit: 25 })).toEqual({ skip: 0, take: 25 })
    expect(toPrismaPage({ page: 3, limit: 50 })).toEqual({ skip: 100, take: 50 })
  })

  it('builds full pagination meta structure', () => {
    expect(buildPaginationMeta({ page: 2, limit: 10 }, 55)).toEqual({
      page: 2,
      limit: 10,
      total: 55,
      pages: 6,
    })

    // Test the 0-item edge case explicitly
    expect(buildPaginationMeta({ page: 1, limit: 25 }, 0)).toEqual({
      page: 1,
      limit: 25,
      total: 0,
      pages: 0,
    })
  })
})
