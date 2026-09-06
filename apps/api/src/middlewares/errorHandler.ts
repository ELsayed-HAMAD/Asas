import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { loadEnv } from '../config/env.js'
import { correlationId } from '../plugins/correlation.js'

const INTERNAL_ERROR_MESSAGE = 'An internal server error occurred'
const VALIDATION_ERROR_MESSAGE = 'Request validation failed'

interface HandlerError extends FastifyError {
  details?: unknown
}

/**
 * Global error handler.
 *
 * Three rules that make it safe to expose:
 * - **5xx messages never reach the client.** A thrown error's `.message` can carry query text
 *   or file paths; the client gets a fixed sentence instead. The identity of the error still
 *   goes to the server log via the request logger for triage.
 * - **Zod failures are surfaced structurally.** `details` carries the flattened issue tree so
 *   a form can render per-field messages rather than a blob.
 * - **Every error carries its correlation id.** `error.requestId` is the `x-request-id` for
 *   this request (see `plugins/correlation.ts`), so a client can hand a failure straight to
 *   the server logs.
 *
 * Stack traces are a local debugging aid only and are stripped in production.
 */
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  const isValidationError = error instanceof ZodError
  const statusCode = error.statusCode || (isValidationError ? 422 : 500)
  const isServerError = statusCode >= 500
  const withDetails = error as HandlerError

  if (isServerError) request.log.error(error)

  let message = error.message
  if (isServerError) message = INTERNAL_ERROR_MESSAGE
  else if (isValidationError) message = VALIDATION_ERROR_MESSAGE

  const body: {
    error: { message: string; details?: unknown; requestId?: string; stack?: string }
  } = {
    error: { message, requestId: correlationId(request) },
  }

  if (isValidationError) body.error.details = error.flatten()
  else if (withDetails.details !== undefined) body.error.details = withDetails.details

  // Stack traces are a local debugging aid only.
  if (!loadEnv().isProduction && isServerError && error.stack !== undefined) {
    body.error.stack = error.stack
  }

  void reply.code(statusCode).send(body)
}
