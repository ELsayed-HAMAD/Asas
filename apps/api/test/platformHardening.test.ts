import { describe, expect, it } from 'vitest'
import { buildApp, resolveRequestId } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'

describe('platform hardening', () => {
  it('accepts bounded request IDs and replaces unsafe headers', () => {
    expect(resolveRequestId('trace_12345678')).toBe('trace_12345678')
    for (const input of ['short', 'x'.repeat(129), 'trace\nforged', ['duplicate', 'header'], undefined]) {
      expect(resolveRequestId(input)).toMatch(/^[a-f0-9-]{36}$/)
    }
  })
  it('does not serve the API document in production by default', async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: 'production' }), { logger: false })
    try {
      expect((await app.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(404)
    } finally { await app.close() }
  })
  it('enforces the PDF byte limit before the upload handler runs', async () => {
    const app = await buildApp(loadEnv({}), { logger: false })
    app.put('/pdf-test', async request => ({ bytes: (request.body as Buffer).length }))
    try {
      const accepted = await app.inject({ method: 'PUT', url: '/pdf-test', headers: { 'content-type': 'application/pdf' }, payload: Buffer.from('%PDF-1.7') })
      expect(accepted.statusCode).toBe(200)
      const oversized = await app.inject({ method: 'PUT', url: '/pdf-test', headers: { 'content-type': 'application/pdf' }, payload: Buffer.alloc(5 * 1024 * 1024 + 1) })
      expect(oversized.statusCode).toBe(413)
    } finally { await app.close() }
  })
})
