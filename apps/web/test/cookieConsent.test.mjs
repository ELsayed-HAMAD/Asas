import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  COOKIE_CONSENT_STORAGE_KEY,
  OPEN_COOKIE_PREFERENCES_EVENT,
  hasAnalyticsConsent,
  openCookiePreferences,
  readCookieConsent,
  saveCookieConsent,
} from '../src/lib/cookieConsent.js'

function installWindow(initial = {}) {
  const values = new Map(Object.entries(initial))
  const events = []
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    dispatchEvent: event => events.push(event),
  }
  return { values, events }
}

afterEach(() => {
  delete globalThis.window
})

test('a visitor has no consent until they save a choice', () => {
  installWindow()

  assert.equal(readCookieConsent(), null)
  assert.equal(hasAnalyticsConsent(), false)
})

test('saving consent persists the versioned record and analytics choice', () => {
  const { values } = installWindow()

  const saved = saveCookieConsent({ analytics: true })

  assert.equal(saved.version, 1)
  assert.equal(saved.essential, true)
  assert.equal(saved.analytics, true)
  assert.ok(Number.isFinite(Date.parse(saved.updatedAt)))
  assert.deepEqual(readCookieConsent(), saved)
  assert.equal(hasAnalyticsConsent(), true)
  assert.match(values.get(COOKIE_CONSENT_STORAGE_KEY), /"analytics":true/)
})

test('malformed, incomplete, or older records do not count as consent', () => {
  installWindow({
    [COOKIE_CONSENT_STORAGE_KEY]: JSON.stringify({ version: 2, essential: true, analytics: true, updatedAt: new Date().toISOString() }),
  })
  assert.equal(readCookieConsent(), null)

  installWindow({
    [COOKIE_CONSENT_STORAGE_KEY]: JSON.stringify({ version: 1, analytics: true, updatedAt: new Date().toISOString() }),
  })
  assert.equal(readCookieConsent(), null)

  installWindow({ [COOKIE_CONSENT_STORAGE_KEY]: '{not json' })
  assert.equal(readCookieConsent(), null)
})

test('blocked browser storage fails closed and reports that the choice was not saved', () => {
  globalThis.window = {
    get localStorage() {
      throw new Error('storage blocked')
    },
  }

  assert.equal(readCookieConsent(), null)
  assert.equal(saveCookieConsent({ analytics: true }), null)
  assert.equal(hasAnalyticsConsent(), false)
})

test('opening preferences dispatches the shared event', () => {
  const { events } = installWindow()

  openCookiePreferences()

  assert.equal(events.length, 1)
  assert.equal(events[0].type, OPEN_COOKIE_PREFERENCES_EVENT)
})
