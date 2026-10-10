import { describe, expect, it } from 'vitest'
import { tenantToday } from '../src/utils/dates.js'

describe('tenantToday', () => {
  it('uses the tenant calendar date across midnight boundaries', () => {
    const instant = new Date('2026-10-07T00:30:00.000Z')
    expect(tenantToday('America/Los_Angeles', instant).toISOString()).toBe('2026-10-06T00:00:00.000Z')
    expect(tenantToday('Africa/Cairo', instant).toISOString()).toBe('2026-10-07T00:00:00.000Z')
    expect(tenantToday('UTC', instant).toISOString()).toBe('2026-10-07T00:00:00.000Z')
  })

  it('rejects invalid workspace timezone configuration', () => {
    expect(() => tenantToday('Not/AZone', new Date('2026-10-07T00:30:00.000Z')))
      .toThrowError(expect.objectContaining({ statusCode: 409 }))
  })
})
