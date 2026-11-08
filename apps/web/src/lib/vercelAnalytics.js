import { inject } from '@vercel/analytics'
import { hasAnalyticsConsent } from './cookieConsent'
import { toAnonymousRoute } from './analyticsRoute'

let injected = false

/**
 * Starts Vercel Web Analytics only after the visitor allows analytics. The first visit has no
 * consent record yet, so this deliberately does nothing until they choose. Local development is
 * skipped; Vercel preview deployments are collected and separable in the dashboard environment
 * filter.
 *
 * `beforeSend` re-reads the stored choice for every event, so revoking consent from the cookie
 * panel stops collection right away even though the injected script stays on the page. It also
 * rewrites each event URL to an anonymous route before it leaves the browser.
 */
export function initVercelAnalytics() {
  if (injected || !import.meta.env.PROD || !hasAnalyticsConsent()) return false
  inject({
    mode: 'production',
    beforeSend: event => (hasAnalyticsConsent() ? { ...event, url: toAnonymousRoute(event.url) } : null),
  })
  injected = true
  return true
}
