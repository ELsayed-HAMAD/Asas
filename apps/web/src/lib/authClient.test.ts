import { describe, expect, it } from 'vitest'
import { authClient } from './authClient.js'

describe('authClient', () => {
  it('exposes the core session and organization methods', () => {
    expect(typeof authClient.signIn.email).toBe('function')
    expect(typeof authClient.signUp.email).toBe('function')
    expect(typeof authClient.signOut).toBe('function')
    expect(typeof authClient.useSession).toBe('function')
    expect(typeof authClient.organization.create).toBe('function')
  })
})
