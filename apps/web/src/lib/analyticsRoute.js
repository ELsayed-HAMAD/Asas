// Record ids in routes (for example /admin/workspaces/<uuid>) are masked so reports stay anonymous.
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * Reduces a page URL to an anonymous route. Query strings and fragments are dropped because auth
 * links carry reset tokens, invitation ids, and e-mail addresses there, and record ids are masked.
 */
export function toAnonymousRoute(url) {
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const parsed = new URL(url, base)
  return `${parsed.origin}${parsed.pathname.replace(UUID_PATTERN, ':id')}`
}
