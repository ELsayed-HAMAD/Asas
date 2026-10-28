import * as Sentry from '@sentry/react'
import { hasAnalyticsConsent } from './cookieConsent'

let initialized = false

/**
 * Initializes error monitoring only after the visitor allows diagnostics. The first visit
 * starts without a consent record, so this deliberately does nothing until they choose.
 */
export function initSentry() {
  if (initialized || !hasAnalyticsConsent()) return false
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return false
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
  initialized = true
  return true
}

/** Applies a changed consent choice without requiring a page reload. */
export function syncSentryConsent() {
  if (hasAnalyticsConsent()) return initSentry()
  if (initialized) {
    initialized = false
    void Sentry.close(2000).catch(() => {})
  }
  return false
}
