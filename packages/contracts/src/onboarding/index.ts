/**
 * Onboarding contract — the wire shapes for the 3-path onboarding flow (empty / sample /
 * import), ported from the legacy `api/src/modules/onboarding/*` per the rebuild plan's
 * Preserve section ("the complete 3-path flow", "make it a tested fixture the suite asserts
 * against", "label sample data visibly in the UI so it can never be mistaken for real records").
 *
 * `onboardingStatus` is the tenant-level marker that drives both the flow's idempotency guards
 * (a `SAMPLE_LOADED` tenant refuses a second sample pack) and the visible "Sample data" label
 * the web shell renders from `GET /onboarding/status`.
 */
import { z } from 'zod'
import { employeeStatusSchema, onboardingStatusSchema } from '../enums.generated.js'
import { boundedText, isoDateSchema, shortTextSchema } from '../primitives/ids.js'
import { decimalStringSchema } from '../primitives/money.js'

// ── Status ─────────────────────────────────────────────────────────────────────

/** `GET /onboarding/status` — the flow's current state for the active workspace. */
export const onboardingStatusResponseSchema = z.object({
  onboardingStatus: onboardingStatusSchema,
  /** True when the tenant already has employee rows (either sample or imported/created). */
  hasHrData: z.boolean(),
  workspaceName: z.string(),
})

export type OnboardingStatusResponse = z.infer<typeof onboardingStatusResponseSchema>

// ── Sample pack ─────────────────────────────────────────────────────────────────

/**
 * `POST /onboarding/sample` — applies the enterprise seed pack to the *current, empty*
 * workspace. The response's `summary` is the per-section row count the apply created, which
 * the E2E suite asserts against (the pack as a *tested fixture*, per the plan).
 */
export const sampleApplyResponseSchema = z.object({
  onboardingStatus: onboardingStatusSchema,
  summary: z.record(z.string(), z.number().int()),
})

export type SampleApplyResponse = z.infer<typeof sampleApplyResponseSchema>

// ── Clear sample data ──────────────────────────────────────────────────────────

/**
 * `DELETE /onboarding/sample-data` — clears the sample dataset from a `SAMPLE_LOADED`
 * workspace so onboarding can run again. `cleared` is a per-model row count (model name →
 * rows deleted) so the UI and audit log can report exactly what was removed; `0` for a model
 * with no rows is expected and meaningful.
 */
export const sampleDataClearResponseSchema = z.object({
  cleared: z.record(z.string(), z.number().int()),
  onboardingStatus: z.literal('PENDING'),
})

export type SampleDataClearResponse = z.infer<typeof sampleDataClearResponseSchema>

// ── Import ──────────────────────────────────────────────────────────────────────

/** One employee row to import. Mirrors the legacy `importEmployeesSchema`, money as decimal strings. */
export const importEmployeeRowSchema = z.object({
  name: shortTextSchema,
  title: shortTextSchema,
  /** Department is resolved by name and created on first sight. */
  department: boundedText(120).optional(),
  status: employeeStatusSchema.optional(),
  email: z.email().optional(),
  location: boundedText(200).optional(),
  /** Major-unit decimal string in the tenant's currency, e.g. '84000'. */
  salary: decimalStringSchema.optional(),
  employeeNumber: boundedText(64).optional(),
  hiredAt: isoDateSchema.optional(),
})

export type ImportEmployeeRow = z.infer<typeof importEmployeeRowSchema>

export const importEmployeesRequestSchema = z.object({
  employees: z.array(importEmployeeRowSchema).min(1).max(500),
})

export type ImportEmployeesRequest = z.infer<typeof importEmployeesRequestSchema>

/** `POST /onboarding/import` — bulk-creates employees, then marks the tenant IMPORTED. */
export const importEmployeesResponseSchema = z.object({
  imported: z.number().int(),
  onboardingStatus: onboardingStatusSchema,
})

export type ImportEmployeesResponse = z.infer<typeof importEmployeesResponseSchema>
