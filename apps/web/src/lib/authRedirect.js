const ALLOWED_AUTH_CALLBACK_PATHS = new Set(['/onboarding', '/dashboard', '/accept-invitation'])

export function getSafeAuthCallbackPath(value, origin) {
  try {
    const url = new URL(value || '/onboarding', origin)
    if (url.origin !== origin || !ALLOWED_AUTH_CALLBACK_PATHS.has(url.pathname)) return '/onboarding'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/onboarding'
  }
}
