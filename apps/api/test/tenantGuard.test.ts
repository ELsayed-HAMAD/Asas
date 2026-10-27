import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import {
  activeTenantId,
  createTenantScope,
  getTenantScope,
  runWithTenantId,
  runWithTenantScope,
  setActiveTenant,
  withCrossTenantAccess,
} from '../src/services/tenantContext.js'
import {
  applyTenantGuard,
  guardTenantArgs,
  isTenantOwnedModel,
  TenantScopeError,
} from '../src/services/tenantGuard.js'

const TENANT = 'tenant_alpha'
const OTHER = 'tenant_beta'

describe('tenant-owned model detection', () => {
  it('uses the generated Prisma schema rather than a hand-maintained list', () => {
    expect(isTenantOwnedModel('Employee')).toBe(true)
    expect(isTenantOwnedModel('PayableInvoice')).toBe(true)
    expect(isTenantOwnedModel('User')).toBe(false)
    expect(isTenantOwnedModel('Tenant')).toBe(false)
  })
})

describe('Prisma tenant guard arguments', () => {
  it('adds the active tenant to bulk reads that forgot a filter', () => {
    expect(guardTenantArgs('Employee', 'findMany', { where: { status: 'ACTIVE' } }, TENANT))
      .toEqual({ where: { status: 'ACTIVE', tenantId: TENANT } })
    expect(guardTenantArgs('Employee', 'findFirst', { where: { email: 'a@example.com' } }, TENANT))
      .toEqual({ where: { email: 'a@example.com', tenantId: TENANT } })
    expect(guardTenantArgs('Employee', 'count', {}, TENANT))
      .toEqual({ where: { tenantId: TENANT } })
    expect(guardTenantArgs('Employee', 'findMany', undefined, TENANT))
      .toEqual({ where: { tenantId: TENANT } })
    expect(() => guardTenantArgs('Employee', 'findMany', 'invalid', TENANT))
      .toThrow('unsupported arguments')
  })

  it('scopes IDOR-prone reads and mutations by bare id', () => {
    expect(guardTenantArgs('Employee', 'findUnique', { where: { id: 'emp_1' } }, TENANT))
      .toEqual({ where: { id: 'emp_1', tenantId: TENANT } })
    expect(guardTenantArgs('Employee', 'update', { where: { id: 'emp_1' }, data: { name: 'A' } }, TENANT))
      .toEqual({ where: { id: 'emp_1', tenantId: TENANT }, data: { name: 'A' } })
    expect(guardTenantArgs('Employee', 'delete', { where: { id: 'emp_1' } }, TENANT))
      .toEqual({ where: { id: 'emp_1', tenantId: TENANT } })
  })

  it('scopes creates and preserves nested tenant references', () => {
    expect(guardTenantArgs('Employee', 'create', { data: { name: 'A' } }, TENANT))
      .toEqual({ data: { name: 'A', tenantId: TENANT } })
    expect(guardTenantArgs('Employee', 'createMany', {
      data: [{ name: 'A' }, { name: 'B', tenantId: TENANT }],
    }, TENANT)).toEqual({
      data: [{ name: 'A', tenantId: TENANT }, { name: 'B', tenantId: TENANT }],
    })
    expect(guardTenantArgs('Employee', 'upsert', {
      where: { id: 'emp_1' },
      create: { name: 'A' },
      update: { name: 'B' },
    }, TENANT)).toEqual({
      where: { id: 'emp_1', tenantId: TENANT },
      create: { name: 'A', tenantId: TENANT },
      update: { name: 'B' },
    })
  })

  it('keeps an explicit matching tenant and composite unique filters', () => {
    const where = { id_tenantId: { id: 'emp_1', tenantId: TENANT } }
    expect(guardTenantArgs('Employee', 'findUnique', { where }, TENANT))
      .toEqual({ where: { ...where, tenantId: TENANT } })
  })

  it('rejects reads, creates, and updates that reference another tenant', () => {
    expect(() => guardTenantArgs('Employee', 'findMany', { where: { tenantId: OTHER } }, TENANT))
      .toThrow(TenantScopeError)
    expect(() => guardTenantArgs('Employee', 'findMany', {
      where: { tenantId: TENANT, department: { tenantId: OTHER } },
    }, TENANT)).toThrow(TenantScopeError)
    expect(() => guardTenantArgs('Employee', 'create', { data: { tenantId: OTHER } }, TENANT))
      .toThrow(TenantScopeError)
    expect(() => guardTenantArgs('Employee', 'update', {
      where: { id: 'emp_1' },
      data: { tenantId: OTHER },
    }, TENANT)).toThrow('moving a record between tenants is not allowed')
    expect(() => guardTenantArgs('Employee', 'findMany', { where: { tenantId: TENANT } }, TENANT))
      .not.toThrow()
  })

  it('does not expose foreign tenant ids in errors', () => {
    try {
      guardTenantArgs('Employee', 'findMany', { where: { tenantId: OTHER } }, TENANT)
      throw new Error('expected guard to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(TenantScopeError)
      expect((error as Error).message).not.toContain(OTHER)
      expect((error as Error).message).not.toContain(TENANT)
    }
  })
})

describe('request tenant context', () => {
  it('stores the authenticated tenant in the current scope', () => {
    const scope = createTenantScope()
    runWithTenantScope(scope, () => {
      expect(activeTenantId()).toBeNull()
      setActiveTenant(TENANT)
      expect(activeTenantId()).toBe(TENANT)
      expect(getTenantScope()?.crossTenant).toBe(false)
      withCrossTenantAccess(() => {
        expect(getTenantScope()?.crossTenant).toBe(true)
      })
      expect(getTenantScope()?.crossTenant).toBe(false)
    })
    expect(activeTenantId()).toBeNull()
  })

  it('scopes an explicit tenant transaction and restores the outer tenant afterwards', async () => {
    const scope = createTenantScope()
    await runWithTenantScope(scope, async () => {
      setActiveTenant(TENANT)
      await runWithTenantId(OTHER, async () => {
        expect(activeTenantId()).toBe(OTHER)
      })
      expect(activeTenantId()).toBe(TENANT)
    })
  })

  it('returns no context outside a request scope', () => {
    expect(activeTenantId()).toBeNull()
    expect(getTenantScope()).toBeUndefined()
    expect(() => withCrossTenantAccess(() => 'ok')).not.toThrow()
  })
})

describe('Fastify request scope integration', () => {
  it('propagates the tenant scope from onRequest through preHandler to the handler', async () => {
    const app = Fastify()
    app.addHook('onRequest', (_request, _reply, done) => {
      runWithTenantScope(createTenantScope(), done)
    })
    app.addHook('preHandler', async () => {
      setActiveTenant(TENANT)
    })
    app.get('/tenant', async () => ({
      tenantId: activeTenantId(),
      crossTenant: getTenantScope()?.crossTenant ?? null,
    }))

    const response = await app.inject({ method: 'GET', url: '/tenant' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ tenantId: TENANT, crossTenant: false })
    await app.close()
  })
})

describe('Prisma extension integration', () => {
  type QueryHandler = (input: {
    model: string
    operation: string
    args: unknown
    query: (args: unknown) => Promise<unknown>
  }) => Promise<unknown>

  type GuardedRunner = {
    run: (model: string, operation: string, args: unknown) => Promise<unknown>
  }

  function fakePrismaClient(): GuardedRunner {
    const client = {
      $extends(extension: { query: { $allModels: { $allOperations: QueryHandler } } }) {
        const handler = extension.query.$allModels.$allOperations
        return {
          run: (model: string, operation: string, args: unknown) =>
            handler({ model, operation, args, query: async next => next }),
        }
      },
    }
    return applyTenantGuard(client as never) as unknown as GuardedRunner
  }

  it('injects the active tenant when the extension is invoked', async () => {
    const guarded = fakePrismaClient()
    const result = await runWithTenantId(TENANT, () =>
      guarded.run('Employee', 'findMany', { where: { status: 'ACTIVE' } }))
    expect(result).toEqual({ where: { status: 'ACTIVE', tenantId: TENANT } })
  })

  it('leaves arguments untouched without a tenant scope or under explicit cross-tenant access', async () => {
    const guarded = fakePrismaClient()
    const unscoped = await guarded.run('Employee', 'findMany', { where: { status: 'ACTIVE' } })
    expect(unscoped).toEqual({ where: { status: 'ACTIVE' } })

    const crossTenant = await runWithTenantId(TENANT, () =>
      withCrossTenantAccess(() => guarded.run('Employee', 'findMany', { where: {} })))
    expect(crossTenant).toEqual({ where: {} })
  })

  it('leaves models without a tenantId column untouched', async () => {
    const guarded = fakePrismaClient()
    const result = await runWithTenantId(TENANT, () =>
      guarded.run('User', 'findMany', { where: { email: 'synthetic@example.test' } }))
    expect(result).toEqual({ where: { email: 'synthetic@example.test' } })
  })
})
