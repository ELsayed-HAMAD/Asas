import test from 'node:test'
import assert from 'node:assert/strict'
import { getSafeAuthCallbackPath } from '../src/lib/authRedirect.js'

const origin = 'https://app.example.com'

test('keeps an invitation callback and its token query', () => {
  assert.equal(
    getSafeAuthCallbackPath(`${origin}/accept-invitation?invitationId=invite_123`, origin),
    '/accept-invitation?invitationId=invite_123',
  )
})

test('rejects external or unsupported authentication callbacks', () => {
  assert.equal(getSafeAuthCallbackPath('https://attacker.example/steal', origin), '/onboarding')
  assert.equal(getSafeAuthCallbackPath('/dashboard/settings/billing', origin), '/onboarding')
  assert.equal(getSafeAuthCallbackPath(undefined, origin), '/onboarding')
})
