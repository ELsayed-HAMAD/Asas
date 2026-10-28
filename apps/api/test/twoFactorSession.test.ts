import { describe, expect, it } from 'vitest'
import { isTwoFactorVerificationPath, withTwoFactorSessionMarker } from '../src/services/twoFactorSession.js'

describe('two-factor session marker', () => {
  it('recognizes the endpoints that prove a second factor', () => {
    for (const path of [
      '/two-factor/verify-totp',
      '/two-factor/verify-otp',
      '/two-factor/verify-backup-code',
      '/api/auth/two-factor/verify-totp',
      '/two-factor/verify-totp/',
      '/two-factor/verify-backup-code?foo=bar',
    ]) {
      expect(isTwoFactorVerificationPath(path), path).toBe(true)
    }
  })

  it('does not mark sign-in paths that bypass the challenge', () => {
    for (const path of [
      null,
      undefined,
      '',
      '/callback/google',
      '/sign-in/email',
      '/verify-email',
      '/two-factor/enable',
    ]) {
      expect(isTwoFactorVerificationPath(path), String(path)).toBe(false)
    }
  })

  it('adds the marker to a verified session only', () => {
    const verifiedAt = new Date('2026-10-28T12:00:00.000Z')
    const session = { id: 'session_1', userId: 'user_1', activeOrganizationId: 'tenant_1' }

    expect(withTwoFactorSessionMarker(session, '/two-factor/verify-totp', verifiedAt)).toEqual({
      ...session,
      twoFactorVerifiedAt: verifiedAt,
    })
    expect(withTwoFactorSessionMarker(session, '/callback/google', verifiedAt)).toBe(session)
  })
})
