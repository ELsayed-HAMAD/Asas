import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearPayrollRunDraft,
  payrollRunDraftStorageKey,
  readPayrollRunDraft,
  savePayrollRunDraft,
} from '../src/lib/payrollRunDraft.js'

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
  removeItem(key) { this.values.delete(key) }
}

const payload = {
  label: 'October payroll',
  payDate: '2026-10-31',
  salaryBasis: 'MONTHLY',
  payFrequency: 'MONTHLY',
  periodsPerYear: 12,
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  taxRates: [{ label: 'Tax', rate: '10' }],
  employeeIds: ['employee_1234567890'],
}

test('retry drafts are isolated by organization and user', () => {
  assert.notEqual(payrollRunDraftStorageKey('org-a', 'user-a'), payrollRunDraftStorageKey('org-b', 'user-a'))
  assert.notEqual(payrollRunDraftStorageKey('org-a', 'user-a'), payrollRunDraftStorageKey('org-a', 'user-b'))
  assert.equal(payrollRunDraftStorageKey('', 'user-a'), null)
})

test('persists the unchanged request payload and key so a failed response can be retried idempotently', () => {
  const storage = new MemoryStorage()
  const key = payrollRunDraftStorageKey('org-a', 'user-a')
  const requestKey = '550e8400-e29b-41d4-a716-446655440000'

  assert.equal(savePayrollRunDraft(storage, key, payload, requestKey), true)
  assert.deepEqual(readPayrollRunDraft(storage, key), { payload, requestKey, signature: JSON.stringify(payload) })

  clearPayrollRunDraft(storage, key)
  assert.equal(readPayrollRunDraft(storage, key), null)
})

test('discards malformed or incomplete saved requests instead of retrying them', () => {
  const storage = new MemoryStorage()
  const key = payrollRunDraftStorageKey('org-a', 'user-a')

  storage.setItem(key, '{broken json')
  assert.equal(readPayrollRunDraft(storage, key), null)
  assert.equal(storage.getItem(key), null)

  storage.setItem(key, JSON.stringify({ requestKey: 'not-a-uuid', payload }))
  assert.equal(readPayrollRunDraft(storage, key), null)
  assert.equal(storage.getItem(key), null)
})
