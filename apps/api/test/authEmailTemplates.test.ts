import { describe, expect, it } from 'vitest'
import { emailVerificationHtml, invitationHtml, passwordResetHtml } from '../src/services/authEmailTemplates.js'

describe('auth email templates', () => {
  it('escapes user-provided names and links in HTML', () => {
    expect(passwordResetHtml('<Ada>', 'https://asas.test/reset?a=1&b=2')).toContain('Hello &lt;Ada&gt;')
    expect(passwordResetHtml('<Ada>', 'https://asas.test/reset?a=1&b=2')).toContain('href="https://asas.test/reset?a=1&amp;b=2"')
    expect(emailVerificationHtml('A "User"', 'https://asas.test/verify?x=1&y=2')).toContain('A &quot;User&quot;')
    expect(emailVerificationHtml(null, 'https://asas.test/verify')).toContain('Hello there')
  })

  it('escapes organization name and role in invitations', () => {
    expect(invitationHtml('<Acme & Co>', 'ADMIN" onmouseover="x', 'https://asas.test/invite?id=1&next=2'))
      .toContain('<strong>&lt;Acme &amp; Co&gt;</strong> as ADMIN&quot; onmouseover=&quot;x.')
    expect(invitationHtml('Acme', 'MEMBER', 'https://asas.test/invite?id=1&next=2'))
      .toContain('href="https://asas.test/invite?id=1&amp;next=2"')
  })
})
