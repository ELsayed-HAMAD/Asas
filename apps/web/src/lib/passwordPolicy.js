/**
 * Unified Password Policy
 *
 * Rules:
 *  - Minimum 12 characters
 *  - At least one uppercase letter (A-Z)
 *  - At least one lowercase letter (a-z)
 *  - At least one number (0-9)
 *  - At least one special symbol (!@#$%^&*...)
 */

export const PASSWORD_POLICY_DESCRIPTION =
  'Must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.'

export function validatePasswordPolicy(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required.'
  }
  if (password.length < 12) {
    return 'Password must be at least 12 characters long.'
  }
  if (password.length > 128) {
    return 'Password cannot exceed 128 characters.'
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.'
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.'
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.'
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one symbol or special character.'
  }
  return null
}

export function getPasswordStrength(password) {
  if (!password) {
    return { score: 0, label: '', color: 'bg-border-default' }
  }

  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1

  switch (score) {
    case 1:
      return { score: 1, label: 'Weak', color: 'bg-danger' }
    case 2:
      return { score: 2, label: 'Fair', color: 'bg-warning' }
    case 3:
      return { score: 3, label: 'Good', color: 'bg-accent' }
    case 4:
      return { score: 4, label: 'Strong', color: 'bg-success' }
    default:
      return { score: 0, label: 'Very Weak', color: 'bg-danger' }
  }
}
