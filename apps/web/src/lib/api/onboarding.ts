import type {
  ImportEmployeesRequest,
  ImportEmployeesResponse,
  OnboardingStatusResponse,
  SampleApplyResponse,
} from '@asas/contracts'
import { http } from './http.js'

/**
 * Typed client for `/api/v1/onboarding/*` — the 3-path flow (empty / sample / import).
 *
 * Every call carries the httpOnly session cookie like the rest of the app, and the active
 * workspace comes from the session — a user never chooses a tenant by hand.
 */
export const onboardingApi = {
  getStatus: () => http.get<OnboardingStatusResponse>('/onboarding/status'),

  /** Mark the workspace as deliberately empty (the "Start with empty workspace" path). */
  markEmpty: () => http.post<OnboardingStatusResponse>('/onboarding/empty', { body: {} }),

  /** Apply the enterprise sample pack. 409s when the workspace already has HR data. */
  applySample: () => http.post<SampleApplyResponse>('/onboarding/sample', { body: {} }),

  /** Bulk-import employees pasted as JSON. */
  importEmployees: (input: ImportEmployeesRequest) =>
    http.post<ImportEmployeesResponse>('/onboarding/import', { body: input }),
}
