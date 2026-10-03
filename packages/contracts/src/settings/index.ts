/**
 * Settings contract — tenant general settings, notification preferences, and integrations.
 *
 * The wire shapes are defined exactly once here so `apps/api`'s settings module and `apps/web`
 * agree on them. Reads of integrations deliberately never include credential fields (see
 * `integrationSchema` below); the update input is the only place a credential may travel.
 */
import { z } from 'zod'
import { integrationStatusSchema } from '../enums.generated.js'
import { boundedText, idSchema, isoDateTimeSchema, shortTextSchema } from '../primitives/ids.js'
import { currencyCodeSchema } from '../primitives/money.js'

// ── General ─────────────────────────────────────────────────────────────────

export const generalSettingsSchema = z.object({
  name: shortTextSchema,
  slug: boundedText(64),
  supportEmail: z.email().nullable(),
  logoUrl: z.url().nullable(),
  timezone: boundedText(64),
  currency: currencyCodeSchema,
  dateFormat: boundedText(32),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type GeneralSettings = z.infer<typeof generalSettingsSchema>

/**
 * Partial by construction: a PATCH of general settings sends only the fields the form changed.
 * `currency` is validated against `@asas/domain`'s ISO 4217 registry at the boundary, so a typo
 * like `'US$'` is a 422 rather than a broken `formatMoney` call everywhere downstream.
 */
export const generalSettingsUpdateSchema = z.object({
  name: shortTextSchema.optional(),
  supportEmail: z.email().nullable().optional(),
  logoUrl: z.url().nullable().optional(),
  timezone: boundedText(64).optional(),
  currency: currencyCodeSchema.optional(),
  dateFormat: boundedText(32).optional(),
})

export type GeneralSettingsUpdateInput = z.infer<typeof generalSettingsUpdateSchema>

// ── Notifications ───────────────────────────────────────────────────────────

export const notificationPreferencesSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  slack: z.boolean(),
})

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>

export const notificationPreferencesUpdateSchema = z
  .object({
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
    slack: z.boolean().optional(),
  })
  .refine(value => Object.keys(value).length > 0, { message: 'At least one channel is required' })

export type NotificationPreferencesUpdateInput = z.infer<typeof notificationPreferencesUpdateSchema>

/**
 * Per-module preference overrides. Keyed by module (`finance`, `projects`, `system`, …) with one
 * entry per event type the module can raise. `null` means "no rows yet for this module" — the
 * UI renders its defaults rather than pretending to have saved them.
 */
export const notificationModuleSchema = z.record(z.string(), notificationPreferencesSchema)

export type NotificationModule = z.infer<typeof notificationModuleSchema>

export const quietHoursSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Expected a time such as '22:00'"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Expected a time such as '07:00'"),
})

export type QuietHours = z.infer<typeof quietHoursSchema>

export const notificationSettingsSchema = z.object({
  modules: z.record(z.string(), notificationModuleSchema),
  quietHours: quietHoursSchema,
  /** Set when the tenant has no quiet-hours row yet; the UI shows the defaults as unsaved. */
  quietHoursDefaulted: z.boolean(),
})

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>

export const notificationSettingsUpdateSchema = z
  .object({
    modules: z
      .record(
        z.string(),
        z.record(z.string(), notificationPreferencesUpdateSchema),
      )
      .optional(),
    quietHours: quietHoursSchema.partial().optional(),
  })
  .refine(value => Object.keys(value).length > 0, { message: 'At least one setting is required' })

export type NotificationSettingsUpdateInput = z.infer<typeof notificationSettingsUpdateSchema>

// ── Integrations ────────────────────────────────────────────────────────────

/**
 * A connected integration's credential *mask*, e.g. `'sk_live_ab…1234'`. The real credential is
 * stored server-side and NEVER returned in a read — the client only ever learns that one exists
 * and what it looks like masked, which is the most a settings page should be able to say.
 */
export interface CredentialMask {
  configured: boolean
  /** Present (and non-empty) iff `configured` is true. Never a raw credential. */
  masked: string | null
}

/**
 * The read shape. Deliberately has no credential field of any kind: `configured` + a mask is
 * everything a UI can show without leaking a secret through the response body (and therefore
 * through logs, service workers, or a curious `console.log`).
 */
export const integrationSchema = z.object({
  id: idSchema,
  name: shortTextSchema,
  description: z.string().nullable(),
  status: integrationStatusSchema,
  syncPullRequests: z.boolean(),
  syncCiCdStatus: z.boolean(),
  credential: z.object({
    configured: z.boolean(),
    masked: z.string().nullable(),
  }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Integration = z.infer<typeof integrationSchema>

/**
 * Create input. `credential.value` is the one place a secret travels in — see the update schema
 * for the masking rule on the way out.
 */
export const integrationWriteSchema = z.object({
  name: shortTextSchema,
  description: boundedText(500).optional().nullable(),
  status: integrationStatusSchema.optional(),
  syncPullRequests: z.boolean().optional(),
  syncCiCdStatus: z.boolean().optional(),
  credential: boundedText(4096).optional().nullable(),
})

export type IntegrationWriteInput = z.infer<typeof integrationWriteSchema>

/**
 * Per-integration update. The credential block is the one place a secret travels, and only in:
 *
 * - `credential.value` sets (or replaces) the stored credential.
 * - `credential.clear: true` deletes it; the two keys are mutually exclusive.
 * - Omitting `credential` entirely leaves the stored value untouched.
 */
export const integrationUpdateSchema = z
  .object({
    name: shortTextSchema.optional(),
    description: boundedText(500).nullable().optional(),
    status: integrationStatusSchema.optional(),
    syncPullRequests: z.boolean().optional(),
    syncCiCdStatus: z.boolean().optional(),
    credential: z
      .object({
        value: boundedText(4096).optional(),
        clear: z.literal(true).optional(),
      })
      .refine(value => !(value.clear && value.value !== undefined), {
        message: 'credential.clear and credential.value are mutually exclusive',
      })
      .optional(),
  })
  .refine(value => Object.keys(value).length > 0, { message: 'At least one field is required' })

export type IntegrationUpdateInput = z.infer<typeof integrationUpdateSchema>

export const integrationsListResponseSchema = z.object({
  items: z.array(integrationSchema),
  summary: z.object({
    connectedCount: z.int().min(0),
    total: z.int().min(0),
  }),
})

export type IntegrationsListResponse = z.infer<typeof integrationsListResponseSchema>

// ── Billing and backups ────────────────────────────────────────────────────

export const subscriptionSchema = z.object({
  id: idSchema,
  planName: shortTextSchema,
  priceMonthly: z.string(),
  status: z.string(),
  renewsOn: isoDateTimeSchema.nullable(),
  seatsUsed: z.int().min(0),
  seatLimit: z.int().min(0),
  storageUsedGb: z.number().min(0),
  storageLimitGb: z.number().min(0),
})

export const paymentMethodSchema = z.object({
  id: idSchema,
  brand: shortTextSchema,
  last4: z.string().regex(/^\d{4}$/),
  expires: z.string().nullable(),
})

export const billingInvoiceSchema = z.object({
  id: idSchema,
  date: isoDateTimeSchema,
  description: shortTextSchema,
  amount: z.string(),
  status: shortTextSchema,
})

export const billingSettingsSchema = z.object({
  subscriptions: z.array(subscriptionSchema),
  paymentMethods: z.array(paymentMethodSchema),
  invoices: z.array(billingInvoiceSchema),
})

export type BillingSettings = z.infer<typeof billingSettingsSchema>

export const backupScheduleSchema = z.object({
  id: idSchema,
  name: shortTextSchema,
  schedule: shortTextSchema,
  enabled: z.boolean(),
  createdAt: isoDateTimeSchema,
})

export const backupScheduleWriteSchema = z.object({
  name: shortTextSchema,
  schedule: shortTextSchema,
  enabled: z.boolean().optional(),
})

export const backupScheduleUpdateSchema = z
  .object({
    name: shortTextSchema.optional(),
    schedule: shortTextSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine(value => Object.keys(value).length > 0, { message: 'At least one field is required' })

export const backupSchedulesResponseSchema = z.object({
  items: z.array(backupScheduleSchema),
})

export type BackupSchedule = z.infer<typeof backupScheduleSchema>
export type BackupScheduleWriteInput = z.infer<typeof backupScheduleWriteSchema>
export type BackupScheduleUpdateInput = z.infer<typeof backupScheduleUpdateSchema>
