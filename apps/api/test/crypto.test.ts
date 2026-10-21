import { describe, expect, it } from 'vitest'
import {
  decryptCredential,
  encryptCredential,
  isEncrypted,
  maskCredential,
} from '../src/services/crypto.js'

describe('Finding 5: Enterprise Credential Encryption Service (AES-256-GCM)', () => {
  const secretKey = 'my-super-secret-master-key-for-unit-testing'
  const tenantId = 'tenant_crypto_1'

  it('correctly identifies encrypted vs unencrypted formats', () => {
    expect(isEncrypted(null)).toBe(false)
    expect(isEncrypted('')).toBe(false)
    expect(isEncrypted('plain_api_key_1234567890')).toBe(false)
    expect(isEncrypted('v1:invalid')).toBe(false)

    const encrypted = encryptCredential('plain_secret', tenantId, secretKey)
    expect(isEncrypted(encrypted)).toBe(true)
  })

  it('encrypts and decrypts credentials cleanly with tenant AAD binding', () => {
    const rawSecret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
    const encrypted = encryptCredential(rawSecret, tenantId, secretKey)

    expect(encrypted).not.toBe(rawSecret)
    expect(encrypted).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/)

    const decrypted = decryptCredential(encrypted, tenantId, secretKey)
    expect(decrypted).toBe(rawSecret)
  })

  it('fails decryption when AAD tenantId does not match (cross-tenant tampering)', () => {
    const rawSecret = 'stripe_sk_live_999999999'
    const encrypted = encryptCredential(rawSecret, 'tenant_victim', secretKey)

    // Attacker tries to decrypt victim's credential under tenant_attacker
    expect(() => {
      decryptCredential(encrypted, 'tenant_attacker', secretKey)
    }).toThrowError(/Unsupported state or unable to authenticate data/)
  })

  it('fails decryption when ciphertext or authentication tag is tampered with', () => {
    const rawSecret = 'slack_webhook_secret_value'
    const encrypted = encryptCredential(rawSecret, tenantId, secretKey)
    const parts = encrypted.split(':')

    // Tamper with ciphertext
    const tamperedCipher = parts[0] + ':' + parts[1] + ':' + parts[2] + ':' + (parts[3].slice(0, -2) + '00')
    expect(() => {
      decryptCredential(tamperedCipher, tenantId, secretKey)
    }).toThrowError(/Unsupported state or unable to authenticate data/)

    // Tamper with tag
    const tamperedTag = parts[0] + ':' + parts[1] + ':' + (parts[2].slice(0, -2) + '00') + ':' + parts[3]
    expect(() => {
      decryptCredential(tamperedTag, tenantId, secretKey)
    }).toThrowError(/Unsupported state or unable to authenticate data/)
  })

  it('gracefully handles legacy unencrypted plaintext credentials', () => {
    const legacyKey = 'legacy_unencrypted_api_key'
    expect(decryptCredential(legacyKey, tenantId, secretKey)).toBe(legacyKey)
  })

  it('safely masks credentials for read responses without revealing plaintext or ciphertext', () => {
    expect(maskCredential(null)).toBeNull()
    expect(maskCredential(undefined as any)).toBeNull()

    // Short credential (<= 8 chars)
    const shortEnc = encryptCredential('1234567', tenantId, secretKey)
    expect(maskCredential(shortEnc, tenantId, secretKey)).toBe('••••••••')

    // Long credential (> 8 chars)
    const longSecret = 'ghp_1234567890abcdef'
    const longEnc = encryptCredential(longSecret, tenantId, secretKey)
    const masked = maskCredential(longEnc, tenantId, secretKey)

    expect(masked).toBe('ghp_…cdef')
    expect(masked).not.toContain('v1:')
    expect(masked).not.toContain('1234567890')
  })
})

