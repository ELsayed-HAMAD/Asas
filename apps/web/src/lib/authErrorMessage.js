export const AUTH_SERVICE_UNREACHABLE =
  'Cannot reach the service right now. Check your connection and try again.'

const NETWORK_ERROR_PATTERN = /failed to fetch|network ?error|load failed|connection refused/i

/**
 * Turn fetch/network failures and provider errors into copy that tells the user what to do.
 * Better Auth can surface a plain Error, a string, or a provider-shaped object with an
 * `error` wrapper, so keep the extraction in one place instead of each auth screen guessing.
 */
export function authErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (typeof error === 'string') {
    return NETWORK_ERROR_PATTERN.test(error) ? AUTH_SERVICE_UNREACHABLE : error
  }

  const directMessage = error.message ? String(error.message) : ''
  if (error.name === 'TypeError' || NETWORK_ERROR_PATTERN.test(directMessage)) {
    return AUTH_SERVICE_UNREACHABLE
  }

  const nestedMessage = error.error?.message ? String(error.error.message) : ''
  if (nestedMessage) {
    return NETWORK_ERROR_PATTERN.test(nestedMessage) ? AUTH_SERVICE_UNREACHABLE : nestedMessage
  }

  if (directMessage) return directMessage
  return fallback
}
