const ALLOWED_AUTH_CALLBACK_PATHS = new Set(['/onboarding', '/dashboard', '/accept-invitation'])

export function getSafeAuthCallbackPath(value, origin, fallback = '/onboarding') {
  try {
    const url = new URL(value || fallback, origin)
    if (url.origin !== origin || !ALLOWED_AUTH_CALLBACK_PATHS.has(url.pathname)) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
