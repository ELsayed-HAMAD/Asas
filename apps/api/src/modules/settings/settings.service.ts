import type {
  Integration as PrismaIntegration,
  NotificationPreference,
  Prisma,
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
  NotificationModule,
  NotificationSettings,
  NotificationSettingsUpdateInput,
  QuietHours,
  BackupSchedule,
  BackupScheduleUpdateInput,
  BackupScheduleWriteInput,
  BillingSettings,
} from '@asas/contracts'
import { AppError } from '../../utils/errors.js'

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
  dateFormat: true,
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
    dateFormat: tenant.dateFormat,
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
  prisma: PrismaClient,
  tenantId: string,
  input: GeneralSettingsUpdateInput,
): Promise<GeneralSettings> {
  await assertTenantExists(prisma, tenantId)

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.supportEmail !== undefined && { supportEmail: input.supportEmail }),
      ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.dateFormat !== undefined && { dateFormat: input.dateFormat }),
    },
    select: generalSelect,
  })
  return mapGeneral(tenant)
}

// ── Notifications ───────────────────────────────────────────────────────────

/**
 * Modules the settings page can configure out of the box, and the defaults it renders for any the
 * tenant has not saved rows for yet. The module *keys* are the wire vocabulary — a tenant may
 * receive rows for other modules from other flows, and those round-trip untouched.
 */
export const NOTIFICATION_MODULES = [
  { module: 'finance', eventType: 'invoice.approval' },
  { module: 'finance', eventType: 'payment.failed' },
  { module: 'projects', eventType: 'sprint.milestone' },
  { module: 'projects', eventType: 'risk.escalation' },
  { module: 'system', eventType: 'security.new_login' },
] as const

const DEFAULT_PREFERENCES = { inApp: true, email: true, slack: false }

type PreferenceRow = { module: string; eventType: string; inApp: boolean; email: boolean; slack: boolean }

function groupByModule(rows: readonly PreferenceRow[]): Record<string, NotificationModule> {
  const modules: Record<string, NotificationModule> = {}
  for (const row of rows) {
    const entry = { inApp: row.inApp, email: row.email, slack: row.slack }
    const bucket = modules[row.module] ?? {}
    bucket[row.eventType] = entry
    modules[row.module] = bucket
  }
  return modules
}

export async function getNotificationSettings(
  prisma: PrismaClient,
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
  prisma: PrismaClient,
  tenantId: string,
  input: NotificationSettingsUpdateInput,
): Promise<NotificationSettings> {
  await assertTenantExists(prisma, tenantId)

  await prisma.$transaction(async tx => {
    if (input.modules) {
      for (const [module, events] of Object.entries(input.modules)) {
        for (const [eventType, prefs] of Object.entries(events)) {
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
  })

  return getNotificationSettings(prisma, tenantId)
}

// ── Integrations ────────────────────────────────────────────────────────────

/**
 * Masks a stored credential for read responses: first 4 characters, then a masked middle, then
 * last 4. Short credentials are fully masked rather than half-revealed. The raw value never
 * leaves this file.
 */
function maskCredential(value: string): string {
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

type IntegrationWithIncludes = PrismaIntegration & { _count: { webhookLogs: number } }

function mapIntegration(integration: PrismaIntegration): Integration {
  return {
    id: integration.id,
    name: integration.name,
    description: integration.description,
    status: integration.status,
    syncPullRequests: integration.syncPullRequests,
    syncCiCdStatus: integration.syncCiCdStatus,
    credential: {
      configured: integration.credential !== null,
      masked: integration.credential !== null ? maskCredential(integration.credential) : null,
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

export async function createIntegration(
  prisma: PrismaClient,
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
      status: input.status ?? 'CONFIGURE',
      syncPullRequests: input.syncPullRequests ?? false,
      syncCiCdStatus: input.syncCiCdStatus ?? false,
      credential: input.credential ?? null,
    },
  })
  return mapIntegration(integration)
}

export async function updateIntegration(
  prisma: PrismaClient,
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
      ...(input.status !== undefined && { status: input.status }),
      ...(input.syncPullRequests !== undefined && { syncPullRequests: input.syncPullRequests }),
      ...(input.syncCiCdStatus !== undefined && { syncCiCdStatus: input.syncCiCdStatus }),
      // `clear` and `value` are mutually exclusive (enforced by the contract), so at most one of
      // these keys is ever present.
      ...(input.credential?.clear === true && { credential: null }),
      ...(input.credential?.value !== undefined && { credential: input.credential.value }),
    },
  })
  return mapIntegration(integration)
}

// ── Billing and backups ────────────────────────────────────────────────────

export async function getBillingSettings(prisma: PrismaClient, tenantId: string): Promise<BillingSettings> {
  const [subscriptions, paymentMethods, invoices] = await Promise.all([
    prisma.subscription.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.paymentMethod.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    prisma.billingInvoice.findMany({ where: { tenantId }, orderBy: { date: 'desc' } }),
  ])

  return {
    subscriptions: subscriptions.map(row => ({
      id: row.id,
      planName: row.planName,
      priceMonthly: row.priceMonthly.toString(),
      status: row.status,
      renewsOn: row.renewsOn?.toISOString() ?? null,
      seatsUsed: row.seatsUsed,
      seatLimit: row.seatLimit,
      storageUsedGb: row.storageUsedGb,
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
    })),
  }
}

function mapBackupSchedule(row: { id: string; name: string; schedule: string; enabled: boolean; createdAt: Date }): BackupSchedule {
  return { id: row.id, name: row.name, schedule: row.schedule, enabled: row.enabled, createdAt: row.createdAt.toISOString() }
}

export async function listBackupSchedules(prisma: PrismaClient, tenantId: string): Promise<{ items: BackupSchedule[] }> {
  const rows = await prisma.backupSchedule.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
  return { items: rows.map(mapBackupSchedule) }
}

export async function createBackupSchedule(prisma: PrismaClient, tenantId: string, input: BackupScheduleWriteInput): Promise<BackupSchedule> {
  const row = await prisma.backupSchedule.create({ data: { tenantId, name: input.name, schedule: input.schedule, enabled: input.enabled ?? true } })
  return mapBackupSchedule(row)
}

export async function updateBackupSchedule(prisma: PrismaClient, tenantId: string, id: string, input: BackupScheduleUpdateInput): Promise<BackupSchedule> {
  const existing = await prisma.backupSchedule.findFirst({ where: { id, tenantId } })
  if (!existing) throw new AppError(404, 'Backup schedule not found')
  const row = await prisma.backupSchedule.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.schedule !== undefined && { schedule: input.schedule }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    },
  })
  return mapBackupSchedule(row)
}

// ── Shared ──────────────────────────────────────────────────────────────────

async function assertTenantExists(prisma: PrismaClient, tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!tenant) throw new AppError(404, 'Workspace not found')
}
