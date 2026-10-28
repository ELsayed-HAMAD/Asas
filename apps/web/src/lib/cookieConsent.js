export const COOKIE_CONSENT_STORAGE_KEY = 'asas.cookie-consent.v1'
export const COOKIE_CONSENT_VERSION = 1
export const OPEN_COOKIE_PREFERENCES_EVENT = 'asas:open-cookie-preferences'

function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Returns a valid saved choice, or null when the visitor has not decided yet. */
export function readCookieConsent() {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(COOKIE_CONSENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed?.version !== COOKIE_CONSENT_VERSION ||
      parsed?.essential !== true ||
      typeof parsed?.analytics !== 'boolean' ||
      typeof parsed?.updatedAt !== 'string'
    ) {
      return null
    }
    return {
      version: COOKIE_CONSENT_VERSION,
      essential: true,
      analytics: parsed.analytics,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

/** Persists the consent record. Returns null when browser storage is unavailable. */
export function saveCookieConsent({ analytics }) {
  const record = {
    version: COOKIE_CONSENT_VERSION,
    essential: true,
    analytics: Boolean(analytics),
    updatedAt: new Date().toISOString(),
  }
  const storage = getStorage()
  if (!storage) return null
  try {
    storage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record))
    return record
  } catch {
    return null
  }
}

export function hasAnalyticsConsent() {
  return readCookieConsent()?.analytics === true
}

export function openCookiePreferences() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT))
  }
}
