const REQUEST_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_DRAFT_SCOPE = 'movements'

export function stockMovementDraftStorageKey(organizationId, userId, scope = DEFAULT_DRAFT_SCOPE) {
  if (!organizationId || !userId) return null
  const base = `asas:stock-movement-retry:v1:${encodeURIComponent(organizationId)}:${encodeURIComponent(userId)}`
  return scope === DEFAULT_DRAFT_SCOPE ? base : `${base}:${encodeURIComponent(scope)}`
}

function isStockMovementPayload(payload) {
  return Boolean(payload)
    && typeof payload.productId === 'string'
    && payload.productId.length > 0
    && Number.isSafeInteger(payload.delta)
    && payload.delta !== 0
    && (payload.note === null || typeof payload.note === 'string')
    && (payload.reason === undefined || typeof payload.reason === 'string')
    && (payload.unitCost === undefined || typeof payload.unitCost === 'string')
}

export function readStockMovementDraft(storage, storageKey) {
  if (!storageKey) return null
  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return null
    const draft = JSON.parse(raw)
    if (!REQUEST_KEY_PATTERN.test(draft?.requestKey) || !isStockMovementPayload(draft?.payload)) {
      storage.removeItem(storageKey)
      return null
    }
    return { payload: draft.payload, requestKey: draft.requestKey, signature: JSON.stringify(draft.payload) }
  } catch {
    try { storage.removeItem(storageKey) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
    return null
  }
}

export function saveStockMovementDraft(storage, storageKey, payload, requestKey) {
  if (!storageKey || !REQUEST_KEY_PATTERN.test(requestKey) || !isStockMovementPayload(payload)) return false
  try {
    storage.setItem(storageKey, JSON.stringify({ payload, requestKey }))
    return true
  } catch {
    return false
  }
}

export function clearStockMovementDraft(storage, storageKey) {
  if (!storageKey) return
  try { storage.removeItem(storageKey) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
}
