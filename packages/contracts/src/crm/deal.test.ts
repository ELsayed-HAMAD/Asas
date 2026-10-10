import { describe, expect, it } from 'vitest'
import { dealListQuerySchema, dealWriteSchema } from './deal.js'

describe('CRM filter and probability contracts', () => {
  it.each([[true, true], [false, false], ['true', true], ['false', false]] as const)('parses openOnly %s as %s', (input, expected) => {
    expect(dealListQuerySchema.parse({ openOnly: input }).openOnly).toBe(expected)
  })
  it.each(['0', '1', 'yes', '', 0, 1])('rejects ambiguous openOnly %s', openOnly => {
    expect(dealListQuerySchema.safeParse({ openOnly }).success).toBe(false)
  })
  it.each([0, 0.5, 1, 100])('retains percentage %s without interpreting it as a fraction', winProbability => {
    expect(dealWriteSchema.parse({ name: 'Deal', winProbability }).winProbability).toBe(winProbability)
  })
  it.each([-1, 101, NaN, Infinity])('rejects invalid percentage %s', winProbability => {
    expect(dealWriteSchema.safeParse({ name: 'Deal', winProbability }).success).toBe(false)
  })
})
