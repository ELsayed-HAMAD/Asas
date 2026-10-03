import { describe, expect, it } from 'vitest'
import {
  boundedText,
  idParamSchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  percentageSchema,
} from './ids.js'

describe('idSchema', () => {
  it('accepts valid cuid identifiers', () => {
    expect(idSchema.parse('cjy4f8t8c000001mg7h6a2j8d')).toBe('cjy4f8t8c000001mg7h6a2j8d')
  })

  it('rejects non-cuid strings', () => {
    expect(() => idSchema.parse('123')).toThrow()
    expect(() => idSchema.parse('')).toThrow()
    expect(() => idSchema.parse('not-a-cuid')).toThrow()
  })

  it('validates id param objects', () => {
    expect(idParamSchema.parse({ id: 'cjy4f8t8c000001mg7h6a2j8d' })).toEqual({
      id: 'cjy4f8t8c000001mg7h6a2j8d',
    })
  })
})

describe('iso dates and times', () => {
  it('validates iso datetime with timezone offset', () => {
    expect(isoDateTimeSchema.parse('2026-08-29T14:30:00Z')).toBe('2026-08-29T14:30:00Z')
    expect(isoDateTimeSchema.parse('2026-08-29T14:30:00+02:00')).toBe(
      '2026-08-29T14:30:00+02:00',
    )
  })

  it('validates iso calendar dates', () => {
    expect(isoDateSchema.parse('2026-08-29')).toBe('2026-08-29')
    expect(() => isoDateSchema.parse('29-08-2026')).toThrow()
  })
})

describe('scalars and boundaries', () => {
  it('validates percentages between 0 and 100', () => {
    expect(percentageSchema.parse(0)).toBe(0)
    expect(percentageSchema.parse(50.5)).toBe(50.5)
    expect(percentageSchema.parse(100)).toBe(100)
    expect(() => percentageSchema.parse(-1)).toThrow()
    expect(() => percentageSchema.parse(100.1)).toThrow()
  })

  it('bounds text lengths and trims', () => {
    const textSchema = boundedText(10)
    expect(textSchema.parse('  hello  ')).toBe('hello')
    expect(() => textSchema.parse('')).toThrow()
    expect(() => textSchema.parse('a'.repeat(11))).toThrow()
  })
})
