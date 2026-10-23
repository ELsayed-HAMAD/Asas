import { Prisma } from '@prisma/client'
import type {
  Integration as PrismaIntegration,
  NotificationPreference,
  PrismaClient,
  Tenant as PrismaTenant,
} from '@prisma/client'
import type {
  GeneralSettings,
  GeneralSettingsUpdateInput,
  Integration,
  IntegrationsListResponse,
  IntegrationUpdateInput,
  IntegrationWriteInput,
  WebhookLog,
  WebhookLogsResponse,
  NotificationModule,
  NotificationSettings,
  NotificationSettingsUpdateInput,
  QuietHours,
  BillingSettings,
  ExchangeRate,
  ExchangeRateListQuery,
  ExchangeRateListResponse,
  ExchangeRateWriteInput,
  GdprAnonymizeRequest,
  GdprAnonymizeResponse,
} from '@asas/contracts'
import { buildPaginationMeta, toPrismaPage } from '@asas/contracts'
import { invalidateAuthCacheForTenant } from '../../middlewares/rbac.js'
import { closeStreamsForTenant } from '../../plugins/sse.js'
import { decryptCredential, encryptCredential, maskCredential } from '../../services/crypto.js'
import type { StripeBillingProvider } from '../../services/stripeBilling.js'
import { getPastDueGraceEndsOn, resolveEffectivePlanLimits, resolveEffectivePlanSubscription } from '../../services/entitlements.js'
import { AppError } from '../../utils/errors.js'
import { probePublicHttpsEndpoint } from './integrationProbe.js'

/**
 * Settings — tenant general settings, notification preferences, and integrations.
 *
 * Every query in this module is scoped by `tenantId` from the authenticated session (the routes
 * never accept a tenant parameter). General settings live on the `Tenant` row itself, so there is
 * exactly one source of truth per tenant; notification preferences and integrations are their own
 * rows keyed by `tenantId`.
 */

// ── General ─────────────────────────────────────────────────────────────────

const generalSelect = {
  name: true,
  slug: true,
  supportEmail: true,
  logoUrl: true,
  timezone: true,
  currency: true,
  currencyLockedAt: true,
  dateFormat: true,
  overtimeThresholdHours: true,
  createdAt: true,
  updatedAt: true,
} as const

function mapGeneral(tenant: Prisma.TenantGetPayload<{ select: typeof generalSelect }>): GeneralSettings {
  return {
    name: tenant.name,
    slug: tenant.slug,
    supportEmail: tenant.supportEmail,
    logoUrl: tenant.logoUrl,
    timezone: tenant.timezone,
    currency: tenant.currency,
    currencyLockedAt: tenant.currencyLockedAt?.toISOString() ?? null,
    dateFormat: tenant.dateFormat,
    overtimeThresholdHours: tenant.overtimeThresholdHours,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  }
}

export async function getTenantSettings(prisma: PrismaClient, tenantId: string): Promise<GeneralSettings> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: generalSelect })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  return mapGeneral(tenant)
}

export async function updateTenantSettings(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  input: GeneralSettingsUpdateInput,
): Promise<GeneralSettings> {
  if ('$transaction' in prisma) return prisma.$transaction(tx => updateTenantSettings(tx, tenantId, input))
  const locked = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE
  `
  if (locked.length === 0) throw new AppError(404, 'Workspace not found')
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId }, select: generalSelect })
  if (!existing) throw new AppError(404, 'Workspace not found')
  if (input.currency !== undefined && input.currency !== existing.currency && existing.currencyLockedAt) {
    throw new AppError(409, 'Base currency is fixed once monetary data exists. Changing a currency label is not an FX conversion')
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.supportEmail !== undefined && { supportEmail: input.supportEmail }),
      ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.dateFormat !== undefined && { dateFormat: input.dateFormat }),
      ...(input.overtimeThresholdHours !== undefined && { overtimeThresholdHours: input.overtimeThresholdHours }),
    },
    select: generalSelect,
  })
  return mapGeneral(tenant)
}

function mapExchangeRate(row: { id: string; currency: string; rateToBase: Prisma.Decimal; effectiveAt: Date; source: string; reference: string | null; createdById: string | null; createdAt: Date }, baseCurrency: string): ExchangeRate {
  return {
    id: row.id, currency: row.currency, baseCurrency, rateToBase: row.rateToBase.toString(),
    effectiveAt: row.effectiveAt.toISOString(), source: 'MANUAL', reference: row.reference,
    createdById: row.createdById, createdAt: row.createdAt.toISOString(),
  }
}

export async function listExchangeRates(prisma: PrismaClient, tenantId: string, query: ExchangeRateListQuery): Promise<ExchangeRateListResponse> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  const where = { tenantId, ...(query.currency && { currency: query.currency }) }
  const [rows, total] = await Promise.all([
    prisma.exchangeRate.findMany({ where, ...toPrismaPage(query), orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }] }),
    prisma.exchangeRate.count({ where }),
  ])
  return { items: rows.map(row => mapExchangeRate(row, tenant.currency)), pagination: buildPaginationMeta(query, total), summary: null }
}

export async function createExchangeRate(prisma: PrismaClient | Prisma.TransactionClient, tenantId: string, actorId: string, input: ExchangeRateWriteInput): Promise<ExchangeRate> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
  if (tenant.currency === input.currency) throw new AppError(400, 'The workspace base currency does not need an FX rate')
  const [whole, fraction = ''] = input.rateToBase.split('.')
  if (whole!.length > 12 || fraction.length > 12) throw new AppError(400, 'An FX rate must fit within 24 digits and 12 decimal places')
  try {
    const row = await prisma.exchangeRate.create({ data: {
      tenantId, currency: input.currency, rateToBase: new Prisma.Decimal(input.rateToBase),
      effectiveAt: new Date(input.effectiveAt), source: 'MANUAL', reference: input.reference ?? null, createdById: actorId,
    } })
    return mapExchangeRate(row, tenant.currency)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'An FX rate already exists for this currency and effective time')
    throw error
  }
}

// ── Notifications ───────────────────────────────────────────────────────────

/**
 * Modules the settings page can configure out of the box, and the defaults it renders for any the
 * tenant has not saved rows for yet. The module *keys* are the wire vocabulary — a tenant may
 * receive rows for other modules from other flows, and those round-trip untouched.
 */
export const NOTIFICATION_MODULES = [
  { module: 'finance', eventType: 'invoice.created' },
  { module: 'hr', eventType: 'leave.requested' },
] as const

const DEFAULT_PREFERENCES = { inApp: true, email: false, slack: false }

type PreferenceRow = { module: string; eventType: string; inApp: boolean; email: boolean; slack: boolean }

function groupByModule(rows: readonly PreferenceRow[]): Record<string, NotificationModule> {
  const modules: Record<string, NotificationModule> = {}
  for (const row of rows) {
    const entry = { inApp: row.inApp, email: false, slack: false }
    const bucket = modules[row.module] ?? {}
    bucket[row.eventType] = entry
    modules[row.module] = bucket
  }
  return modules
}

export async function getNotificationSettings(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
): Promise<NotificationSettings> {
  const [rows, quietHours] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { tenantId } }),
    prisma.quietHours.findFirst({ where: { tenantId } }),
  ])

  // Start from the known modules' defaults and overlay saved rows on top, so a tenant that has
  // never touched the page still gets a complete, editable table instead of an empty one.
  const defaults: Record<string, NotificationModule> = {}
  for (const { module, eventType } of NOTIFICATION_MODULES) {
    const bucket = defaults[module] ?? {}
    bucket[eventType] = DEFAULT_PREFERENCES
    defaults[module] = bucket
  }
  const saved = groupByModule(rows)
  const modules: Record<string, NotificationModule> = {}
  for (const [module, entries] of Object.entries({ ...defaults, ...saved })) {
    modules[module] = entries
  }

  return {
    modules,
    quietHours: {
      start: quietHours?.start ?? '22:00',
      end: quietHours?.end ?? '07:00',
    },
    quietHoursDefaulted: !quietHours,
  }
}

export async function updateNotificationSettings(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  input: NotificationSettingsUpdateInput,
): Promise<NotificationSettings> {
  await assertTenantExists(prisma, tenantId)

  const updateRows = async (tx: PrismaClient | Prisma.TransactionClient) => {
    if (input.modules) {
      for (const [module, events] of Object.entries(input.modules)) {
        for (const [eventType, prefs] of Object.entries(events)) {
          if (prefs.email === true || prefs.slack === true) {
            throw new AppError(409, 'Email and Slack notification delivery are not configured for this deployment.')
          }
          await tx.notificationPreference.upsert({
            where: { tenantId_module_eventType: { tenantId, module, eventType } },
            create: {
              tenantId,
              module,
              eventType,
              inApp: prefs.inApp ?? DEFAULT_PREFERENCES.inApp,
              email: prefs.email ?? DEFAULT_PREFERENCES.email,
              slack: prefs.slack ?? DEFAULT_PREFERENCES.slack,
            },
            update: {
              ...(prefs.inApp !== undefined && { inApp: prefs.inApp }),
              ...(prefs.email !== undefined && { email: prefs.email }),
              ...(prefs.slack !== undefined && { slack: prefs.slack }),
            },
          })
        }
      }
    }

    if (input.quietHours) {
      await tx.quietHours.upsert({
        where: { tenantId },
        create: {
          tenantId,
          start: input.quietHours.start ?? '22:00',
          end: input.quietHours.end ?? '07:00',
        },
        update: {
          ...(input.quietHours.start !== undefined && { start: input.quietHours.start }),
          ...(input.quietHours.end !== undefined && { end: input.quietHours.end }),
        },
      })
    }
  }

  if ('$transaction' in prisma) await prisma.$transaction(updateRows)
  else await updateRows(prisma)

  return getNotificationSettings(prisma, tenantId)
}

// ── Integrations ────────────────────────────────────────────────────────────

type IntegrationWithIncludes = PrismaIntegration & { _count: { webhookLogs: number } }

function mapIntegration(integration: PrismaIntegration): Integration {
  return {
    id: integration.id,
    name: integration.name,
    description: integration.description,
    status: integration.status,
    // Provider sync is not implemented. Do not expose legacy flags as active capabilities.
    syncPullRequests: false,
    syncCiCdStatus: false,
    credential: {
      configured: integration.credential !== null,
      masked: integration.credential !== null ? maskCredential(integration.credential, integration.tenantId) : null,
    },
    createdAt: integration.createdAt.toISOString(),
    updatedAt: integration.updatedAt.toISOString(),
  }
}

export async function getIntegrationSettings(
  prisma: PrismaClient,
  tenantId: string,
): Promise<IntegrationsListResponse> {
  const [rows, connectedCount, total] = await Promise.all([
    prisma.integration.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    prisma.integration.count({ where: { tenantId, status: 'CONNECTED' } }),
    prisma.integration.count({ where: { tenantId } }),
  ])

  return {
    items: rows.map(mapIntegration),
    // Counts come from SQL `COUNT(*)` over the whole tenant set — the KPI is not a `.reduce()`
    // over a client-side array, per the rebuild rules.
    summary: { connectedCount, total },
  }
}

export async function getIntegrationWebhookLogs(
  prisma: PrismaClient,
  tenantId: string,
  integrationId: string,
): Promise<WebhookLogsResponse> {
  const integration = await prisma.integration.findFirst({ where: { id: integrationId, tenantId }, select: { id: true } })
  if (!integration) throw new AppError(404, 'Integration not found')
  const rows = await prisma.webhookLog.findMany({
    where: { integrationId: integration.id, integration: { tenantId } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, statusCode: true, event: true, createdAt: true },
  })
  return { items: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) }
}

export async function createIntegration(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  input: IntegrationWriteInput,
): Promise<Integration> {
  await assertTenantExists(prisma, tenantId)
  const existing = await prisma.integration.findFirst({ where: { tenantId, name: input.name } })
  if (existing) throw new AppError(409, 'An integration with this name already exists')

  const integration = await prisma.integration.create({
    data: {
      tenantId,
      name: input.name,
      description: input.description ?? null,
      status: 'CONFIGURE',
      syncPullRequests: false,
      syncCiCdStatus: false,
      credential: input.credential ? encryptCredential(input.credential, tenantId) : null,
    },
  })
  return mapIntegration(integration)
}

export async function updateIntegration(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  id: string,
  input: IntegrationUpdateInput,
): Promise<Integration> {
  const existing = await prisma.integration.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Integration not found')

  const integration = await prisma.integration.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.credential !== undefined && { status: 'CONFIGURE' }),
      // `clear` and `value` are mutually exclusive (enforced by the contract), so at most one of
      // these keys is ever present.
      ...(input.credential?.clear === true && { credential: null }),
      ...(input.credential?.value !== undefined && { credential: encryptCredential(input.credential.value, tenantId) }),
    },
  })
  return mapIntegration(integration)
}

export async function testIntegration(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
): Promise<{ success: boolean; log: WebhookLog }> {
  const integration = await prisma.integration.findFirst({ where: { id, tenantId } })
  if (!integration) throw new AppError(404, 'Integration not found')

  // Verify and decrypt the credential in memory for the probe
  let decryptedCred: string | null = null
  if (integration.credential) {
    decryptedCred = decryptCredential(integration.credential, tenantId)
  }

  let statusCode = 400
  let isSuccess = false

  // The integration credential field stores the endpoint for this probe. Never report a
  // token-only configuration as connected, and never probe arbitrary HTTP/private hosts.
  const targetUrl = decryptedCred
  if (targetUrl) {
    try {
      statusCode = await probePublicHttpsEndpoint(targetUrl)
      isSuccess = statusCode >= 200 && statusCode < 300
    } catch (err) {
      statusCode = err instanceof Error && err.name === 'TimeoutError' ? 504 : 400
      isSuccess = false
    }
  }

  const log = await prisma.webhookLog.create({
    data: {
      integrationId: integration.id,
      statusCode,
      event: 'ping',
    },
  })
  // The endpoint may have been changed while the network probe was in flight. Only let this
  // probe update health for the exact credential value it actually tested.
  await prisma.integration.updateMany({
    where: { id: integration.id, tenantId, credential: integration.credential },
    data: { status: isSuccess ? 'CONNECTED' : 'CONFIGURE' },
  })

  return {
    success: isSuccess,
    log: {
      id: log.id,
      statusCode: log.statusCode,
      event: log.event,
      createdAt: log.createdAt.toISOString(),
    },
  }
}

// ── Billing and backups ────────────────────────────────────────────────────

export async function getBillingSettings(prisma: PrismaClient, tenantId: string, measuredStorageUsedGb: number | null = null): Promise<BillingSettings> {
  let subscriptions = await prisma.subscription.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
  if (subscriptions.length === 0) {
    try {
      const free = await prisma.subscription.create({
        data: {
          tenantId,
          planName: 'Free Starter',
          priceMonthly: 0,
          status: 'ACTIVE',
          seatLimit: 5,
          storageLimitGb: 5,
        },
      })
      subscriptions = [free]
    } catch {
      // Concurrency catch: if created in parallel, re-query
      subscriptions = await prisma.subscription.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
    }
  }

  const [paymentMethods, invoices, memberCount, tenant] = await Promise.all([
    prisma.paymentMethod.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.billingInvoice.findMany({ where: { tenantId }, orderBy: { date: 'desc' } }),
    prisma.member.count({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { stripeCustomerId: true } }),
  ])
  const now = new Date()
  const effectiveLimits = resolveEffectivePlanLimits(subscriptions, now)
  const effectiveSubscription = resolveEffectivePlanSubscription(subscriptions, now)

  return {
    stripePortalAvailable: Boolean(tenant?.stripeCustomerId),
    effectivePlan: {
      planName: effectiveLimits.planName,
      priceMonthly: effectiveSubscription?.priceMonthly.toString() ?? '0',
      currency: effectiveSubscription?.stripeCurrency ?? 'USD',
      billingStatus: effectiveSubscription?.status === 'PAST_DUE' ? 'PAST_DUE' : effectiveSubscription ? 'ACTIVE' : 'FREE',
      source: effectiveLimits.source,
      renewsOn: effectiveSubscription?.renewsOn?.toISOString() ?? null,
      graceEndsOn: effectiveSubscription?.status === 'PAST_DUE' ? getPastDueGraceEndsOn(effectiveSubscription).toISOString() : null,
      seatsUsed: memberCount,
      seatLimit: effectiveLimits.seatLimit,
      storageUsedGb: measuredStorageUsedGb,
      storageLimitGb: effectiveLimits.storageLimitGb,
    },
    subscriptions: subscriptions.map(row => ({
      id: row.id,
      planName: row.planName,
      priceMonthly: row.priceMonthly.toString(),
      currency: row.stripeCurrency ?? 'USD',
      priceId: row.stripePriceId,
      status: row.status,
      renewsOn: row.renewsOn?.toISOString() ?? null,
      seatsUsed: memberCount > 0 ? memberCount : row.seatsUsed,
      seatLimit: row.seatLimit,
      storageUsedGb: measuredStorageUsedGb,
      storageLimitGb: row.storageLimitGb,
    })),
    paymentMethods: paymentMethods.map(row => ({
      id: row.id,
      brand: row.brand,
      last4: row.last4,
      expires: row.expires,
    })),
    invoices: invoices.map(row => ({
      id: row.id,
      date: row.date.toISOString(),
      description: row.description,
      amount: row.amount.toString(),
      status: row.status,
      currency: row.stripeCurrency,
    })),
  }
}

export function ensureAutomaticBackupsUnavailable(): never {
  throw new AppError(409, 'Automated backups are not configured for this deployment.')
}

// ── Shared ──────────────────────────────────────────────────────────────────

export async function deleteWorkspace(
  prisma: PrismaClient,
  tenantId: string,
  _userId: string,
  stripeBilling: StripeBillingProvider | null = null,
): Promise<{ success: boolean }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')

  const activeStripeSubscriptions = await prisma.subscription.findMany({
    where: { tenantId, status: { in: ['ACTIVE', 'PAST_DUE'] }, stripeSubscriptionId: { not: null } },
    select: { stripeSubscriptionId: true },
  })
  const subscriptionIds = activeStripeSubscriptions.flatMap(row => row.stripeSubscriptionId ? [row.stripeSubscriptionId] : [])
  if (subscriptionIds.length && !stripeBilling) {
    throw new AppError(503, 'Stripe billing is unavailable. The workspace was not deleted; restore billing connectivity and retry.')
  }

  // Cancel remotely before archiving or purging. If any request fails, retain workspace data
  // and access so the owner can retry. Cancellation is idempotent, so retries handle partial success.
  for (const subscriptionId of subscriptionIds) {
    try {
      await stripeBilling!.cancelSubscription(subscriptionId)
    } catch {
      throw new AppError(502, 'Stripe could not confirm subscription cancellation. The workspace was not deleted; retry after billing is available.')
    }
  }

  // Stage 1 and 2 are one local transaction. If any purge step fails, archive status,
  // session revocation, and local billing changes roll back together so the owner can retry.
  try {
    await prisma.$transaction(async tx => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      })
      await tx.session.updateMany({ where: { activeOrganizationId: tenantId }, data: { activeOrganizationId: null } })
      await tx.subscription.updateMany({
        where: { tenantId, status: { in: ['ACTIVE', 'PAST_DUE'] } },
        data: { status: 'CANCELED' },
      })

      // Elevate session setting to permit compliant administrative deletion of append-only ledgers
      await tx.$executeRawUnsafe("SET LOCAL asas.allow_tenant_purge = 'on'")

      // 1. Clean up restricted financial models
      await tx.journalLine.deleteMany({ where: { entry: { tenantId } } })
      await tx.journalEntry.deleteMany({ where: { tenantId } })
      await tx.ledgerAccount.deleteMany({ where: { tenantId } })
      await tx.exchangeRate.deleteMany({ where: { tenantId } })

      // 2. Clean up invitations and memberships
      await tx.invitation.deleteMany({ where: { tenantId } })
      await tx.member.deleteMany({ where: { tenantId } })

      // 3. Delete the tenant itself (cascading deletes will handle all remaining tables)
      await tx.tenant.delete({ where: { id: tenantId } })
    })
  } catch {
    throw new AppError(503, 'Workspace deletion could not finish. Local data and access were retained; retry when the service is available. Any Stripe cancellations are safe to retry.')
  }

  invalidateAuthCacheForTenant(tenantId)
  closeStreamsForTenant(tenantId)

  return { success: true }
}

async function assertTenantExists(prisma: PrismaClient | Prisma.TransactionClient, tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
}

export async function anonymizeEntity(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  input: GdprAnonymizeRequest,
): Promise<GdprAnonymizeResponse> {
  const { targetType, targetId } = input

  if (targetType === 'EMPLOYEE') {
    const employee = await prisma.employee.findUnique({
      where: { id: targetId },
    })
    if (!employee || employee.tenantId !== tenantId) {
      throw new AppError(404, 'Employee not found in this workspace')
    }

    const shortId = targetId.slice(-6)
    await prisma.employee.update({
      where: { id: targetId },
      data: {
        name: `Anonymized Employee ${shortId}`,
        email: `anonymized_${shortId}@redacted.local`,
        avatarUrl: null,
        location: null,
        band: null,
        employeeNumber: null,
        status: 'ARCHIVED',
      },
    })

    // Scrub personal free-form notes from attendance and leave records while preserving financial audit hours
    if (typeof (prisma as any).leaveRequest?.updateMany === 'function') {
      await (prisma as any).leaveRequest.updateMany({
        where: { employeeId: targetId },
        data: { reason: 'Redacted per GDPR erasure request' },
      })
    }
    if (typeof (prisma as any).timesheet?.updateMany === 'function') {
      await (prisma as any).timesheet.updateMany({
        where: { employeeId: targetId },
        data: { note: null },
      })
    }

    return {
      success: true,
      targetType: 'EMPLOYEE',
      targetId,
      anonymizedAt: new Date().toISOString(),
      recordsScrubbed: 1,
    }
  }

  if (targetType === 'USER') {
    const member = await prisma.member.findFirst({
      where: { userId: targetId, tenantId },
      include: { user: true },
    })
    if (!member || !member.user) {
      throw new AppError(404, 'User is not a member of this workspace')
    }

    const shortId = targetId.slice(-6)

    // Scrub tenant-scoped support tickets created by this user
    if (typeof (prisma as any).supportTicket?.updateMany === 'function') {
      await (prisma as any).supportTicket.updateMany({
        where: { tenantId, createdById: targetId },
        data: { subject: 'Redacted Ticket' },
      })
    }

    // Multi-tenant privacy safeguard: only mutate global User identity if user has no other workspaces
    const otherMemberships = typeof (prisma as any).member?.count === 'function'
      ? await (prisma as any).member.count({
          where: { userId: targetId, tenantId: { not: tenantId } },
        })
      : 0

    if (otherMemberships === 0 && typeof (prisma as any).user?.update === 'function') {
      await (prisma as any).user.update({
        where: { id: targetId },
        data: {
          name: `Anonymized User ${shortId}`,
          email: `anonymized_${shortId}@redacted.local`,
          image: null,
        },
      })
    }

    // Evict membership from this tenant and invalidate auth cache
    if (typeof (prisma as any).member?.delete === 'function') {
      await (prisma as any).member.delete({ where: { id: member.id } })
    }
    invalidateAuthCacheForTenant(tenantId)

    return {
      success: true,
      targetType: 'USER',
      targetId,
      anonymizedAt: new Date().toISOString(),
      recordsScrubbed: 1,
    }
  }

  if (targetType === 'CANDIDATE') {
    const candidate = await prisma.candidate.findUnique({
      where: { id: targetId },
    })
    if (!candidate || candidate.tenantId !== tenantId) {
      throw new AppError(404, 'Candidate not found in this workspace')
    }

    const shortId = targetId.slice(-6)
    await prisma.candidate.update({
      where: { id: targetId },
      data: {
        name: `Anonymized Candidate ${shortId}`,
        email: `anonymized_${shortId}@redacted.local`,
        phone: null,
        resumeUrl: null,
        notes: 'Redacted per GDPR erasure request',
      },
    })

    return {
      success: true,
      targetType: 'CANDIDATE',
      targetId,
      anonymizedAt: new Date().toISOString(),
      recordsScrubbed: 1,
    }
  }

  throw new AppError(400, 'Unsupported target type')
}

