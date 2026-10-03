/**
 * Response envelopes.
 *
 * These describe the shapes the running API already emits — `{ data }` from `utils/response.js`
 * and `{ error: { message, details? } }` from `middlewares/errorHandler.js` — so the generated
 * client and the live server agree from day one rather than after a reconciliation pass.
 *
 * The envelope is kept because it leaves room for `meta` later without a breaking change, and
 * because a bare array as a top-level JSON response is a well-known versioning dead end.
 */
import { z } from 'zod'

/** Wrap a payload schema in the success envelope. */
export function envelope<Payload extends z.ZodType>(payload: Payload) {
  return z.object({ data: payload })
}

/**
 * The error envelope.
 *
 * `details` is `unknown` rather than a fixed shape because it carries two different things: a
 * Zod `flatten()` result for a 422, or a handler-supplied `error.details` object otherwise.
 * Narrowing it here would force one of the two to be misdescribed.
 *
 * `requestId` is the `x-request-id` correlation value for the request that failed (see the
 * API's correlation plugin); clients include it in support reports so a failure can be traced
 * to a server log line without re-deriving the id from logs.
 *
 * `stack` exists in non-production responses only. It is declared so the client's type is
 * honest about what it may receive in development, not so anything depends on it.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
    stack: z.string().optional(),
  }),
})

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>

/** 204 responses carry no body; declared so route definitions can be explicit about it. */
export const noContentSchema = z.void()

/**
 * Standard failure responses, for the `response` map of a route definition.
 *
 * Listing them explicitly is what makes the generated OpenAPI document — and therefore the
 * generated client — describe failures instead of only the happy path.
 */
export const errorResponses = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  422: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
  500: errorEnvelopeSchema,
} as const
