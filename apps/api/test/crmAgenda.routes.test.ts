import Fastify from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import type { Auth } from '../src/auth.js'
import { crmRoutes } from '../src/modules/crm/crm.routes.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'

const itemId = 'clxxxxxxxxxxxxxxxxxxxxxxx'
const createdAt = new Date('2026-10-23T12:00:00.000Z')

async function setup(failAudit = false) {
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.decorate('auth', { api: { getSession: async () => ({ session: { activeOrganizationId: 'tenant_1' }, user: { id: 'admin_1' } }) } } as unknown as Auth)
  let item: Record<string, unknown> | null = null
  const audits: Record<string, unknown>[] = []
  const publish = vi.fn()
  const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
    let stagedItem = item ? { ...item } : null
    const stagedAudits = [...audits]
    const tx = {
      agendaItem: {
        findMany: async () => stagedItem ? [stagedItem] : [],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          stagedItem = { id: itemId, title: data.title, timeLabel: data.timeLabel ?? null, priority: data.priority ?? null, done: data.done ?? false, createdAt }
          return stagedItem
        },
        findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => where.id === itemId && where.tenantId === 'tenant_1' ? stagedItem : null,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          stagedItem = { ...stagedItem!, ...data }
          return stagedItem
        },
      },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failAudit) throw new Error('Audit unavailable')
        stagedAudits.push(data)
      } },
    }
    const result = await work(tx)
    item = stagedItem
    audits.splice(0, audits.length, ...stagedAudits)
    return result
  })
  app.decorate('prisma', { member: { findUnique: async () => ({ role: 'ADMIN' }) }, $transaction: transaction } as unknown as PrismaClient)
  app.decorate('ssePublish', publish)
  await app.register(crmRoutes)
  return { app, audits, publish, transaction, item: () => item }
}

describe('CRM agenda routes', () => {
  it('writes and audits agenda changes transactionally, then publishes CRM invalidation', async () => {
    const f = await setup()
    try {
      const created = await f.app.inject({ method: 'POST', url: '/agenda', payload: { title: 'Call customer' } })
      expect(created.statusCode, created.body).toBe(201)
      expect(created.json().data).toMatchObject({ id: itemId, title: 'Call customer', done: false })
      const updated = await f.app.inject({ method: 'PATCH', url: `/agenda/${itemId}`, payload: { done: true } })
      expect(updated.statusCode, updated.body).toBe(200)
      expect(updated.json().data.done).toBe(true)
      expect(f.audits.map(audit => audit.action)).toEqual(['crm.agenda.create', 'crm.agenda.update'])
      expect(f.audits.every(audit => audit.actorId === 'admin_1')).toBe(true)
      expect(f.publish).toHaveBeenCalledTimes(2)
    } finally { await f.app.close() }
  })

  it('does not persist a new agenda item or publish when its audit fails', async () => {
    const f = await setup(true)
    try {
      const response = await f.app.inject({ method: 'POST', url: '/agenda', payload: { title: 'Call customer' } })
      expect(response.statusCode).toBe(500)
      expect(f.item()).toBeNull()
      expect(f.audits).toEqual([])
      expect(f.publish).not.toHaveBeenCalled()
    } finally { await f.app.close() }
  })
})
