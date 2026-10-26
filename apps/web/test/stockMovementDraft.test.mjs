import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearStockMovementDraft,
  readStockMovementDraft,
  saveStockMovementDraft,
  stockMovementDraftStorageKey,
} from '../src/lib/stockMovementDraft.js'

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
  removeItem(key) { this.values.delete(key) }
}

const payload = {
  productId: 'product_1234567890',
  delta: 3,
  note: 'PO-2026-081',
  reason: 'PURCHASE_RECEIPT',
  unitCost: '12.50',
}

test('stock movement retry drafts are isolated by organization, user, and entry point', () => {
  const movementKey = 'asas:stock-movement-retry:v1:org-a:user-a'
  assert.equal(stockMovementDraftStorageKey('org-a', 'user-a'), movementKey)
  assert.equal(stockMovementDraftStorageKey('org-a', 'user-a', 'movements'), movementKey)
  assert.notEqual(stockMovementDraftStorageKey('org-a', 'user-a'), stockMovementDraftStorageKey('org-b', 'user-a'))
  assert.notEqual(stockMovementDraftStorageKey('org-a', 'user-a'), stockMovementDraftStorageKey('org-a', 'user-b'))
  assert.notEqual(stockMovementDraftStorageKey('org-a', 'user-a', 'catalog'), movementKey)
  assert.equal(stockMovementDraftStorageKey('', 'user-a'), null)
})

test('persists the unchanged movement payload and request key for a lost-response retry', () => {
  const storage = new MemoryStorage()
  const key = stockMovementDraftStorageKey('org-a', 'user-a')
  const requestKey = '550e8400-e29b-41d4-a716-446655440000'

  assert.equal(saveStockMovementDraft(storage, key, payload, requestKey), true)
  assert.deepEqual(readStockMovementDraft(storage, key), { payload, requestKey, signature: JSON.stringify(payload) })

  clearStockMovementDraft(storage, key)
  assert.equal(readStockMovementDraft(storage, key), null)
})

test('discards malformed or incomplete saved movements instead of retrying them', () => {
  const storage = new MemoryStorage()
  const key = stockMovementDraftStorageKey('org-a', 'user-a')

  storage.setItem(key, '{broken json')
  assert.equal(readStockMovementDraft(storage, key), null)
  assert.equal(storage.getItem(key), null)

  storage.setItem(key, JSON.stringify({ requestKey: 'not-a-uuid', payload }))
  assert.equal(readStockMovementDraft(storage, key), null)
  assert.equal(storage.getItem(key), null)

  storage.setItem(key, JSON.stringify({
    requestKey: '550e8400-e29b-41d4-a716-446655440000',
    payload: { ...payload, delta: 0 },
  }))
  assert.equal(readStockMovementDraft(storage, key), null)
  assert.equal(storage.getItem(key), null)
})
