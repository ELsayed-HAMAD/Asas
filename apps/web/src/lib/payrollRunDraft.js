const REQUEST_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function payrollRunDraftStorageKey(organizationId, userId) {
  if (!organizationId || !userId) return null
  return `asas:payroll-run-retry:v1:${encodeURIComponent(organizationId)}:${encodeURIComponent(userId)}`
}

function isPayrollPayload(payload) {
  return Boolean(payload)
    && typeof payload.label === 'string'
    && (payload.payDate === null || typeof payload.payDate === 'string')
    && typeof payload.salaryBasis === 'string'
    && typeof payload.payFrequency === 'string'
    && Number.isInteger(payload.periodsPerYear)
    && typeof payload.periodStart === 'string'
    && typeof payload.periodEnd === 'string'
    && Array.isArray(payload.taxRates)
    && payload.taxRates.every(rate => typeof rate?.label === 'string' && typeof rate?.rate === 'string')
    && Array.isArray(payload.employeeIds)
    && payload.employeeIds.length > 0
    && payload.employeeIds.every(id => typeof id === 'string' && id.length > 0)
}

export function readPayrollRunDraft(storage, storageKey) {
  if (!storageKey) return null
  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return null
    const draft = JSON.parse(raw)
    if (!REQUEST_KEY_PATTERN.test(draft?.requestKey) || !isPayrollPayload(draft?.payload)) {
      storage.removeItem(storageKey)
      return null
    }
    return { payload: draft.payload, requestKey: draft.requestKey, signature: JSON.stringify(draft.payload) }
  } catch {
    try { storage.removeItem(storageKey) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
    return null
  }
}

export function savePayrollRunDraft(storage, storageKey, payload, requestKey) {
  if (!storageKey || !REQUEST_KEY_PATTERN.test(requestKey) || !isPayrollPayload(payload)) return false
  try {
    storage.setItem(storageKey, JSON.stringify({ payload, requestKey }))
    return true
  } catch {
    return false
  }
}

export function clearPayrollRunDraft(storage, storageKey) {
  if (!storageKey) return
  try { storage.removeItem(storageKey) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
}
