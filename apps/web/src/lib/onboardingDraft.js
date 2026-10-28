/**
 * Draft of the onboarding wizard, kept in `sessionStorage` so a reload, a redirect, or a
 * failed workspace launch does not send the owner back to step 1 and lose their answers.
 *
 * The draft is intentionally per-user and short-lived: it is never sent to the API, and it is
 * discarded when the workspace launch succeeds, when the user explicitly starts a fresh
 * workspace, or after a day. `sessionStorage` means it also disappears when the tab closes.
 */
const DRAFT_STORAGE_KEY = 'asas.onboarding.draft.v1'
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const STEPS = new Set([1, 2, 3])
const DATA_MODES = new Set(['empty', 'sample', 'import', 'migration'])
const MODULE_IDS = new Set(['finance', 'hr', 'crm', 'projects', 'inventory'])
const CURRENCY_PATTERN = /^[A-Z]{3}$/
const MAX_COMPANY_NAME_LENGTH = 200
const MAX_TIMEZONE_LENGTH = 64

/** The browser's session storage, or null where storage access is blocked. */
export function onboardingDraftStorage() {
  try { return window.sessionStorage } catch { return null }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isDraftValid(draft, userId) {
  if (!isPlainObject(draft)) return false
  if (draft.userId !== userId) return false
  if (!Number.isFinite(draft.savedAt)) return false
  const age = Date.now() - draft.savedAt
  if (age < 0 || age > DRAFT_MAX_AGE_MS) return false
  if (!STEPS.has(draft.step)) return false
  if (typeof draft.companyName !== 'string' || draft.companyName.length > MAX_COMPANY_NAME_LENGTH) return false
  if (typeof draft.currency !== 'string' || !CURRENCY_PATTERN.test(draft.currency)) return false
  if (typeof draft.timezone !== 'string' || draft.timezone.length === 0 || draft.timezone.length > MAX_TIMEZONE_LENGTH) return false
  if (!DATA_MODES.has(draft.dataMode)) return false
  if (!Array.isArray(draft.migrationModules) || draft.migrationModules.some(id => !MODULE_IDS.has(id))) return false
  return true
}

/** Reads the draft for this user, deleting it when it is missing, malformed, or stale. */
export function readOnboardingDraft(storage, userId) {
  if (!storage || !userId) return null
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw)
    if (!isDraftValid(draft, userId)) {
      storage.removeItem(DRAFT_STORAGE_KEY)
      return null
    }
    return {
      step: draft.step,
      companyName: draft.companyName,
      currency: draft.currency,
      timezone: draft.timezone,
      dataMode: draft.dataMode,
      migrationModules: [...draft.migrationModules],
    }
  } catch {
    try { storage.removeItem(DRAFT_STORAGE_KEY) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
    return null
  }
}

/** Persists the wizard state. Returns false when storage rejects the write. */
export function saveOnboardingDraft(storage, userId, draft) {
  if (!storage || !userId || !isPlainObject(draft)) return false
  const payload = {
    userId,
    savedAt: Date.now(),
    step: draft.step,
    companyName: draft.companyName,
    currency: draft.currency,
    timezone: draft.timezone,
    dataMode: draft.dataMode,
    migrationModules: Array.isArray(draft.migrationModules) ? draft.migrationModules : [],
  }
  if (!isDraftValid(payload, userId)) return false
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function clearOnboardingDraft(storage) {
  if (!storage) return
  try { storage.removeItem(DRAFT_STORAGE_KEY) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
}
