import { z } from 'zod'

/**
 * Parse query flags without JavaScript truthiness coercion: the string "false" stays false.
 * Accept browser and form encodings while rejecting arbitrary strings.
 */
export const booleanQueryParamSchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform(value => value === true || value === 'true')

/** Query parsers for form endpoints that also emit numeric boolean strings. */
export const formBooleanQueryParamSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform(value => value === true || value === 'true' || value === '1')
