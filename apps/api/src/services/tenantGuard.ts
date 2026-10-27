import { Prisma, type PrismaClient } from '@prisma/client'
import { getTenantScope } from './tenantContext.js'

/**
 * Application-level tenant guard.
 *
 * PostgreSQL RLS policies exist for defence-in-depth, but the ordinary pooled connection does
 * not set `app.tenant_id`, and a superuser/owner role bypasses RLS by design. This Prisma
 * client extension is the practical enforcement layer:
 *
 *  - It runs only when a request (or `withTenantContext`) has an active tenant.
 *  - It identifies models that own a `tenantId` column from the generated Prisma DMMF.
 *  - It injects the active `tenantId` into `where` clauses and create payloads.
 *  - It rejects any operation that explicitly references a different tenant.
 *
 * The result is fail-closed for cross-tenant mutations and IDOR-style reads by bare `id`,
 * without requiring every call site to remember the filter. Models without a `tenantId`
 * column (users, sessions, the `Tenant` row itself) are left alone.
 */

const tenantModelNames = new Set(
  Prisma.dmmf.datamodel.models
    .filter(model => model.fields.some(field => field.name === 'tenantId'))
    .map(model => model.name),
)

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
])

const CREATE_OPERATIONS = new Set(['create'])
const CREATE_MANY_OPERATIONS = new Set(['createMany', 'createManyAndReturn'])
const UPDATE_DATA_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn'])

const guardedClients = new WeakSet<object>()

type UnknownRecord = Record<string, unknown>

export class TenantScopeError extends Error {
  readonly code = 'TENANT_SCOPE_VIOLATION'

  constructor(message: string) {
    super(message)
    this.name = 'TenantScopeError'
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Collect every literal `tenantId` value in a nested Prisma argument object. */
function collectTenantIds(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectTenantIds(item, found)
    return found
  }
  if (!isRecord(value)) return found
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'tenantId' && typeof nested === 'string') found.push(nested)
    else if (isRecord(nested) || Array.isArray(nested)) collectTenantIds(nested, found)
  }
  return found
}

function assertNoForeignTenant(model: string, operation: string, value: unknown, tenantId: string): void {
  const foreign = collectTenantIds(value).find(candidate => candidate !== tenantId)
  if (foreign !== undefined) {
    throw new TenantScopeError(`Blocked ${model}.${operation}: a different tenant was referenced`)
  }
}

function withTenantWhere(model: string, operation: string, where: unknown, tenantId: string): UnknownRecord {
  assertNoForeignTenant(model, operation, where, tenantId)
  if (where === undefined || where === null) return { tenantId }
  if (!isRecord(where)) {
    throw new TenantScopeError(`Blocked ${model}.${operation}: unsupported where clause`)
  }
  if (where.tenantId === tenantId) return where
  if (where.tenantId !== undefined) {
    throw new TenantScopeError(`Blocked ${model}.${operation}: a different tenant was referenced`)
  }
  return { ...where, tenantId }
}

function withTenantData(model: string, operation: string, data: unknown, tenantId: string): UnknownRecord {
  assertNoForeignTenant(model, operation, data, tenantId)
  if (!isRecord(data)) {
    throw new TenantScopeError(`Blocked ${model}.${operation}: unsupported data payload`)
  }
  if (data.tenantId === tenantId) return data
  if (data.tenantId !== undefined) {
    throw new TenantScopeError(`Blocked ${model}.${operation}: a different tenant was referenced`)
  }
  return { ...data, tenantId }
}

function assertTenantUnchanged(model: string, operation: string, data: unknown, tenantId: string): UnknownRecord {
  if (!isRecord(data)) return {}
  if (data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantScopeError(`Blocked ${model}.${operation}: moving a record between tenants is not allowed`)
  }
  assertNoForeignTenant(model, operation, data, tenantId)
  return data
}

/**
 * Apply the tenant constraint to an operation's arguments. Exported as a pure function so the
 * guard's behaviour can be tested without a database connection.
 */
export function guardTenantArgs(
  model: string,
  operation: string,
  args: unknown,
  tenantId: string,
): unknown {
  const input = args === undefined ? {} : args
  if (!isRecord(input)) {
    throw new TenantScopeError(`Blocked ${model}.${operation}: unsupported arguments`)
  }
  let next: UnknownRecord = input

  if (CREATE_OPERATIONS.has(operation)) {
    next = { ...next, data: withTenantData(model, operation, next.data, tenantId) }
  } else if (CREATE_MANY_OPERATIONS.has(operation)) {
    next = {
      ...next,
      data: Array.isArray(next.data)
        ? next.data.map(row => withTenantData(model, operation, row, tenantId))
        : withTenantData(model, operation, next.data, tenantId),
    }
  } else if (operation === 'upsert') {
    next = {
      ...next,
      create: withTenantData(model, operation, next.create, tenantId),
      update: assertTenantUnchanged(model, operation, next.update, tenantId),
    }
  } else if (UPDATE_DATA_OPERATIONS.has(operation)) {
    next = { ...next, data: assertTenantUnchanged(model, operation, next.data, tenantId) }
  }

  if (WHERE_OPERATIONS.has(operation)) {
    next = { ...next, where: withTenantWhere(model, operation, next.where, tenantId) }
  }

  return next
}

export function isTenantOwnedModel(model: string): boolean {
  return tenantModelNames.has(model)
}

/**
 * Wrap a Prisma client with the tenant guard. The returned client is a Prisma client
 * extension, so every repository/transaction call inherits it. Raw SQL is not covered here;
 * `scripts/check-tenant-filters.mjs` remains the tripwire for `$queryRaw`/`$executeRaw`.
 */
export function applyTenantGuard<T extends PrismaClient>(client: T): T {
  if (typeof (client as unknown as { $extends?: unknown }).$extends !== 'function') return client
  if (guardedClients.has(client)) return client

  const extended = client.$extends({
    name: 'asas-tenant-guard',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scope = getTenantScope()
          if (!scope?.tenantId || scope.crossTenant || !model || !isTenantOwnedModel(model)) {
            return query(args)
          }
          return query(guardTenantArgs(model, operation, args, scope.tenantId) as typeof args)
        },
      },
    },
  })

  guardedClients.add(extended as unknown as object)
  return extended as unknown as T
}
