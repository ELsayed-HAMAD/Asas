/**
 * Shared scalar primitives.
 *
 * Every model in `schema.prisma` uses `@default(cuid())`, so ids are cuids — not uuids. Zod's
 * `z.cuid()` is used rather than a loose `z.string()` because an id is the one parameter that
 * reaches a `where` clause on every request: rejecting a malformed one at the boundary turns a
 * class of 500s into a 422 with a useful message.
 */
import { z } from 'zod'

export const idSchema = z.cuid('Expected a cuid identifier')

/** Route parameter shape for the `/:id` endpoints, which is most of the API. */
export const idParamSchema = z.object({ id: idSchema })

export type IdParam = z.infer<typeof idParamSchema>

/**
 * A timestamp as an ISO 8601 string.
 *
 * The wire format is a string in UTC, never a `Date` and never epoch milliseconds: JSON has no
 * date type, and a bare number loses the caller's ability to tell seconds from milliseconds.
 */
export const isoDateTimeSchema = z.iso.datetime({ offset: true })

/** A calendar date with no time component, e.g. a leave request's `startDate`. */
export const isoDateSchema = z.iso.date()

/** Accepts either wire form and hands back a `Date` for the service layer. */
export const dateFromIsoSchema = z
  .union([isoDateTimeSchema, isoDateSchema])
  .transform(value => new Date(value))

/**
 * A percentage expressed as a percentage, 0–100 — not a 0–1 fraction.
 *
 * The distinction is written into the type because the two conventions coexist in the current
 * codebase (`winProbability` is 0–100, tax rates are applied as fractions), and a silent
 * hundredfold error in a financial figure is the kind that ships.
 */
export const percentageSchema = z.number().min(0).max(100)

/** Free-text field with a length ceiling, so a request body cannot be unbounded. */
export function boundedText(max: number, min = 1) {
  return z.string().trim().min(min).max(max)
}

export const shortTextSchema = boundedText(200)
export const longTextSchema = boundedText(5_000)
