/**
 * Unified Password Policy
 *
 * Rules:
 *  - Minimum 12 characters
 *  - At least one uppercase letter (A-Z)
 *  - At least one lowercase letter (a-z)
 *  - At least one number (0-9)
 *  - At least one special symbol (!@#$%^&*...)
 *
 * `validatePasswordPolicy` accepts an optional i18next `t` function so callers that
 * translate the UI can surface the message in the active language. Without it the
 * English messages are returned, which keeps non-React callers and tests working.
 */

export const PASSWORD_POLICY_DESCRIPTION =
  'Must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.'

function translate(t, key, fallback) {
  return typeof t === 'function' ? t(key, fallback) : fallback
}

export function validatePasswordPolicy(password, t) {
  if (!password || typeof password !== 'string') {
    return translate(t, 'auth.passwordPolicy.required', 'Password is required.')
  }
  if (password.length < 12) {
    return translate(t, 'auth.passwordPolicy.tooShort', 'Password must be at least 12 characters long.')
  }
  if (password.length > 128) {
    return translate(t, 'auth.passwordPolicy.tooLong', 'Password cannot exceed 128 characters.')
  }
  if (!/[A-Z]/.test(password)) {
    return translate(t, 'auth.passwordPolicy.uppercase', 'Password must contain at least one uppercase letter.')
  }
  if (!/[a-z]/.test(password)) {
    return translate(t, 'auth.passwordPolicy.lowercase', 'Password must contain at least one lowercase letter.')
  }
  if (!/[0-9]/.test(password)) {
    return translate(t, 'auth.passwordPolicy.number', 'Password must contain at least one number.')
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return translate(t, 'auth.passwordPolicy.symbol', 'Password must contain at least one symbol or special character.')
  }
  return null
}

/**
 * `key` is the stable translation key suffix (`auth.passwordPolicy.strength.<key>`);
 * `label` stays English for non-React callers.
 */
export function getPasswordStrength(password) {
  if (!password) {
    return { score: 0, key: 'notStarted', label: '', color: 'bg-border-default' }
  }

  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1

  switch (score) {
    case 1:
      return { score: 1, key: 'weak', label: 'Weak', color: 'bg-danger' }
    case 2:
      return { score: 2, key: 'fair', label: 'Fair', color: 'bg-warning' }
    case 3:
      return { score: 3, key: 'good', label: 'Good', color: 'bg-accent' }
    case 4:
      return { score: 4, key: 'strong', label: 'Strong', color: 'bg-success' }
    default:
      return { score: 0, key: 'veryWeak', label: 'Very Weak', color: 'bg-danger' }
  }
}
