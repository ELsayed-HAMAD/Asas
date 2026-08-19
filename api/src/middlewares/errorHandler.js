import { ZodError } from 'zod'

export function errorHandler(error, _request, reply) {
  const statusCode = error.statusCode || (error instanceof ZodError ? 422 : 500)
  if (statusCode >= 500) _request.log.error(error)
  reply.code(statusCode).send({
    error: { message: statusCode >= 500 ? 'Internal server error' : error.message, details: error instanceof ZodError ? error.flatten() : error.details },
  })
}
