import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Enterprise Application-Level Encryption Service
 *
 * Implements authenticated encryption using AES-256-GCM with Additional Authenticated Data (AAD).
 * Used for encrypting third-party credentials (API keys, webhook tokens) and sensitive bank details.
 *
 * Serialization Format:
 *   v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 *
 * Key Derivation:
 *   HKDF-SHA256 from application master secret with dedicated salt and context string.
 */

const KEY_SALT = 'asas-credential-salt-v1'
const KEY_INFO = 'asas:integration:credential:v1'
const BANK_KEY_SALT = 'asas-bank-data-salt-v1'
const BANK_KEY_INFO = 'asas:employee:bank-data:v1'
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH_BYTES = 12
const TAG_LENGTH_BYTES = 16

/** Cache derived 32-byte keys by source secret to avoid repeated HKDF calculation per record. */
const keyCache = new Map<string, Buffer>()

function getDerivedKey(secret?: string, salt = KEY_SALT, info = KEY_INFO): Buffer {
  const masterSecret =
    secret ||
    process.env.ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    'default-insecure-dev-master-secret-32-chars-long!'

  const cacheKey = `${salt}:${info}:${masterSecret}`
  let key = keyCache.get(cacheKey)
  if (!key) {
    const derived = hkdfSync('sha256', Buffer.from(masterSecret, 'utf8'), salt, info, 32)
    key = Buffer.from(derived)
    keyCache.set(cacheKey, key)
  }
  return key
}

function getBankDataMasterSecret(secret?: string): string {
  if (secret) return secret
  const configured = process.env.BANK_DATA_ENCRYPTION_KEY
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BANK_DATA_ENCRYPTION_KEY is required to read or write employee bank details in production')
  }
  return process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET || 'default-insecure-dev-master-secret-32-chars-long!'
}

export function isBankEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const parts = value.split(':')
  if (parts.length !== 4 || parts[0] !== 'b1') return false
  const [, ivHex, tagHex, cipherHex] = parts
  return Boolean(ivHex && tagHex && cipherHex)
    && ivHex!.length === IV_LENGTH_BYTES * 2
    && tagHex!.length === TAG_LENGTH_BYTES * 2
    && cipherHex!.length > 0
    && /^[0-9a-f]+$/i.test(ivHex!)
    && /^[0-9a-f]+$/i.test(tagHex!)
    && /^[0-9a-f]+$/i.test(cipherHex!)
}

/** Tenant- and field-bound encryption for employee bank identifiers. Legacy plaintext is read-compatible during backfill. */
export function encryptBankDetail(plaintext: string, tenantId: string, field: string, secret?: string): string {
  if (!plaintext) return plaintext
  const key = getDerivedKey(getBankDataMasterSecret(secret), BANK_KEY_SALT, BANK_KEY_INFO)
  const iv = randomBytes(IV_LENGTH_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH_BYTES })
  cipher.setAAD(Buffer.from(`bank-data:${tenantId}:${field}`, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `b1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`
}

/** Decrypts bank details; plaintext values are returned only to support a staged legacy backfill. */
export function decryptBankDetail(value: string | null | undefined, tenantId: string, field: string, secret?: string): string | null {
  if (value == null || value === '') return value ?? null
  const parts = value.split(':')
  if (parts.length !== 4 || parts[0] !== 'b1') return value
  const [, ivHex, tagHex, cipherHex] = parts
  if (!ivHex || !tagHex || !cipherHex || !/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(tagHex) || !/^[0-9a-f]+$/i.test(cipherHex)) {
    throw new Error('Employee bank detail ciphertext is malformed')
  }
  const key = getDerivedKey(getBankDataMasterSecret(secret), BANK_KEY_SALT, BANK_KEY_INFO)
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'), { authTagLength: TAG_LENGTH_BYTES })
  decipher.setAAD(Buffer.from(`bank-data:${tenantId}:${field}`, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()]).toString('utf8')
}

/** Check if a string is serialized in our versioned encrypted format. */
export function isEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const parts = value.split(':')
  if (parts.length !== 4) return false
  const [version, ivHex, tagHex, cipherHex] = parts
  if (!version || !ivHex || !tagHex || !cipherHex) return false
  return (
    version === 'v1' &&
    ivHex.length === IV_LENGTH_BYTES * 2 &&
    tagHex.length === TAG_LENGTH_BYTES * 2 &&
    cipherHex.length > 0 &&
    /^[0-9a-f]+$/i.test(ivHex) &&
    /^[0-9a-f]+$/i.test(tagHex) &&
    /^[0-9a-f]+$/i.test(cipherHex)
  )
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 *
 * @param plaintext The secret to encrypt
 * @param aad Optional Additional Authenticated Data (e.g. tenantId) to cryptographically bind ciphertext to its tenant
 * @param secret Optional master secret override (defaults to environment auth secret)
 */
export function encryptCredential(plaintext: string, aad?: string, secret?: string): string {
  if (!plaintext) return plaintext
  const key = getDerivedKey(secret)
  const iv = randomBytes(IV_LENGTH_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH_BYTES })

  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'))
  }

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
}

/**
 * Decrypts a versioned AES-256-GCM ciphertext.
 *
 * @param encrypted The serialized ciphertext string
 * @param aad Optional Additional Authenticated Data that was bound during encryption
 * @param secret Optional master secret override
 */
export function decryptCredential(encrypted: string, aad?: string, secret?: string): string {
  if (!encrypted) return encrypted

  // If not encrypted in our format, handle legacy plaintext gracefully
  if (!isEncrypted(encrypted)) {
    return encrypted
  }

  const parts = encrypted.split(':')
  const [, ivHex, tagHex, cipherHex] = parts
  if (!ivHex || !tagHex || !cipherHex) {
    return encrypted
  }

  const key = getDerivedKey(secret)
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(cipherHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH_BYTES })
  decipher.setAuthTag(tag)

  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'))
  }

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}

/**
 * Masks a stored credential for safe read responses.
 *
 * Decrypts the credential in memory if it is encrypted, then returns a masked preview
 * (first 4 and last 4 characters, or all bullets if short).
 * NEVER leaks the raw value or the ciphertext.
 */
export function maskCredential(value: string | null, aad?: string, secret?: string): string | null {
  if (value === null || value === undefined) return null
  let clear: string
  try {
    clear = isEncrypted(value) ? decryptCredential(value, aad, secret) : value
  } catch {
    // If decryption fails (e.g. key mismatch), return full mask to avoid breaking UI
    return '••••••••'
  }

  if (clear.length <= 8) return '••••••••'
  return `${clear.slice(0, 4)}…${clear.slice(-4)}`
}
