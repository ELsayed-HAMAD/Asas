import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { ZodError, z } from 'zod'
import { errorHandler } from '../src/middlewares/errorHandler.js'

function makeReply(): FastifyReply {
  let sent: unknown
  let codeValue = '500'
  const reply = {
    code(value: number) {
      codeValue = String(value)
      return reply
    },
    send(payload: unknown) {
      sent = payload
      return reply
    },
    // capture for assertions
    get statusCode() {
      return Number(codeValue)
    },
    get body() {
      return sent
    },
  } as unknown as FastifyReply & { statusCode: number; body: unknown }
  return reply
}

function makeRequest(): FastifyRequest {
  return { log: { error: () => undefined } } as unknown as FastifyRequest
}

describe('errorHandler', () => {
  it.each(['P2004', 'P2010'])('maps a trusted currency guard from %s to a safe conflict', code => {
    const reply = makeReply()
    const error = Object.assign(new Error('private SQL metadata'), {
      name: 'PrismaClientKnownRequestError', code,
      meta: { database_error: 'ASAS_CURRENCY_LOCKED: private details', message: 'ASAS_CURRENCY_CONFLICT: private details' },
    })
    errorHandler(error, makeRequest(), reply)
    expect(reply.statusCode).toBe(409)
    expect((reply.body as { error: { message: string } }).error.message).toContain('FX conversion')
    expect((reply.body as { error: { message: string } }).error.message).not.toContain('private')
  })
  it('does not classify unrelated database constraint errors as currency conflicts', () => {
    const reply = makeReply()
    errorHandler(Object.assign(new Error('private metadata'), { name: 'PrismaClientKnownRequestError', code: 'P2004', meta: { database_error: 'Unrelated constraint' } }), makeRequest(), reply)
    expect(reply.statusCode).toBe(500)
    expect((reply.body as { error: { message: string } }).error.message).toBe('An internal server error occurred')
  })
  it.each([['P2002', 409], ['P2025', 404], ['P2034', 409]])('maps %s without leaking database details', (code, status) => {
    const reply = makeReply()
    const error = Object.assign(new Error('private database metadata'), { name: 'PrismaClientKnownRequestError', code })
    errorHandler(error, makeRequest(), reply)
    expect(reply.statusCode).toBe(status)
    expect((reply.body as { error: { message: string } }).error.message).not.toContain('private')
  })
  it('masks 5xx messages so internals never reach the client', () => {
    const reply = makeReply()
    const error = Object.assign(new Error('Postgres error: column "secret" of relation "users"'), {
      statusCode: 500,
    })
    errorHandler(error, makeRequest(), reply)
    expect(reply.statusCode).toBe(500)
    const body = reply.body as { error: { message: string } }
    expect(body.error.message).toBe('An internal server error occurred')
    expect(body.error.message).not.toContain('Postgres')
  })

  it('does not attach a stack trace in production', () => {
    process.env.NODE_ENV = 'production'
    const reply = makeReply()
    errorHandler(Object.assign(new Error('boom'), { statusCode: 500 }), makeRequest(), reply)
    const body = reply.body as { error: { stack?: string } }
    expect(body.error.stack).toBeUndefined()
    delete process.env.NODE_ENV
  })

  it('surfaces Zod flatten as structured details with a 422', () => {
    const reply = makeReply()
    try {
      z.object({ name: z.string().min(2) }).parse({ name: 'x' })
    } catch (error) {
      errorHandler(error as ZodError, makeRequest(), reply)
    }
    expect(reply.statusCode).toBe(422)
    const body = reply.body as { error: { message: string; details: unknown } }
    expect(body.error.message).toBe('Request validation failed')
    expect(body.error.details).toBeDefined()
  })
})
