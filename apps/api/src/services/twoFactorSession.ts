/**
 * Better Auth's two-factor plugin creates the session for a credential sign-in from inside the
 * `/two-factor/verify-*` endpoints. Those are the only session-creation paths that prove the
 * user supplied a second factor: OAuth callbacks, trusted-device sign-ins, and
 * email-verification auto sign-ins all create sessions without a challenge.
 *
 * Marking the session in `databaseHooks.session.create.before` lets privileged surfaces
 * distinguish "signed in with a second factor" from "signed in, but the second factor was
 * never checked". The platform console then requires a step-up verification for the latter.
 */
const TWO_FACTOR_VERIFICATION_PATHS = [
  '/two-factor/verify-totp',
  '/two-factor/verify-otp',
  '/two-factor/verify-backup-code',
] as const

export function isTwoFactorVerificationPath(path: string | null | undefined): boolean {
  if (!path) return false
  // The hook receives the endpoint path without a base path, but strip a query string and
  // trailing slashes to stay robust if Better Auth changes how it reports the path.
  const normalized = path.split('?')[0]?.replace(/\/+$/, '') ?? ''
  return TWO_FACTOR_VERIFICATION_PATHS.some(candidate => normalized.endsWith(candidate))
}

/** Add the marker to the session row Better Auth is about to create. */
export function withTwoFactorSessionMarker<T extends Record<string, unknown>>(
  session: T,
  path: string | null | undefined,
  verifiedAt: Date = new Date(),
): T {
  if (!isTwoFactorVerificationPath(path)) return session
  return { ...session, twoFactorVerifiedAt: verifiedAt }
}
