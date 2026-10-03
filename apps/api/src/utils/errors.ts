/**
 * `AppError` carries the HTTP status a route wants, plus optional structured `details`.
 * `errorHandler` (see middlewares/errorHandler.ts) reads exactly these two fields off any
 * thrown error, so this class is the one place a handler needs to reach for a 4xx.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.details = details
  }
}
