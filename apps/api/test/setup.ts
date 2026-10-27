/**
 * Deterministic, test-only secrets.
 *
 * Vitest loads this before any test module, so encryption and auth helpers never depend on
 * a developer's ignored `.env` file or on production credentials. These values are public
 * by design and must never be used outside the test process.
 */
process.env.AUTH_SECRET ||= 'test-only-auth-secret-32-characters-long'
process.env.ENCRYPTION_KEY ||= 'test-only-encryption-key-32-characters-long'
process.env.BANK_DATA_ENCRYPTION_KEY ||= 'test-only-bank-data-key-32-characters-long'
