import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearOnboardingDraft,
  readOnboardingDraft,
  saveOnboardingDraft,
} from '../src/lib/onboardingDraft.js'

const DRAFT_STORAGE_KEY = 'asas.onboarding.draft.v1'

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
  removeItem(key) { this.values.delete(key) }
}

const draft = {
  step: 3,
  companyName: 'Draft Workspace',
  currency: 'EGP',
  timezone: 'Africa/Cairo',
  dataMode: 'sample',
  migrationModules: ['hr', 'crm'],
}

test('persists and restores the onboarding step and choices for the same user', () => {
  const storage = new MemoryStorage()

  assert.equal(saveOnboardingDraft(storage, 'user-a', draft), true)
  assert.deepEqual(readOnboardingDraft(storage, 'user-a'), draft)

  clearOnboardingDraft(storage)
  assert.equal(readOnboardingDraft(storage, 'user-a'), null)
})

test('never restores a draft written by another user', () => {
  const storage = new MemoryStorage()
  saveOnboardingDraft(storage, 'user-a', draft)

  assert.equal(readOnboardingDraft(storage, 'user-b'), null)
  // The mismatched draft is removed so it cannot leak into the other account's wizard.
  assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null)
})

test('discards drafts older than a day and malformed drafts', () => {
  const storage = new MemoryStorage()
  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    userId: 'user-a',
    savedAt: Date.now() - 25 * 60 * 60 * 1000,
    ...draft,
  }))
  assert.equal(readOnboardingDraft(storage, 'user-a'), null)
  assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null)

  storage.setItem(DRAFT_STORAGE_KEY, '{broken json')
  assert.equal(readOnboardingDraft(storage, 'user-a'), null)
  assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null)

  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    userId: 'user-a',
    savedAt: Date.now(),
    ...draft,
    dataMode: 'unknown',
    migrationModules: ['payroll'],
  }))
  assert.equal(readOnboardingDraft(storage, 'user-a'), null)
})

test('refuses to save invalid state instead of persisting a broken draft', () => {
  const storage = new MemoryStorage()

  assert.equal(saveOnboardingDraft(storage, 'user-a', { ...draft, step: 9 }), false)
  assert.equal(saveOnboardingDraft(storage, 'user-a', { ...draft, currency: 'usd' }), false)
  assert.equal(saveOnboardingDraft(storage, 'user-a', { ...draft, migrationModules: ['payroll'] }), false)
  assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null)
})
