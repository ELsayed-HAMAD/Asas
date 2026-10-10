/**
 * Server-Sent Events push client.
 *
 * Opens one long-lived `EventSource` to `GET /api/v1/events` and, whenever the server emits an
 * `invalidate` frame (after any successful write mutation in the user's tenant), invalidates the
 * matching TanStack Query caches so every open tab self-heals without polling.
 *
 * The stringified key prefixes in the frames (e.g. `"asas,finance"`) are the `String()` form of
 * the TanStack Query keys built in `queryKeys.js`, minus the tenant-scope segment — the stream
 * is tenant-scoped, so `scopeServerPrefix` re-inserts the active organization before matching.
 */

import { scopeServerPrefix } from './queryKeys'

const SSE_URL = `${import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4000'}/api/v1/events`

/** No frame (data or keepalive comment) for this long → treat an "open" socket as dead. */
const STALE_AFTER_MS = 30_000
/**
 * Delay before rebuilding after a detected hard close, so a flapping link is not tight-looped.
 * Doubles on each consecutive failure up to the max; resets once a connection opens or a frame
 * arrives.
 */
const REBUILD_BASE_DELAY_MS = 1_000
const REBUILD_MAX_DELAY_MS = 30_000

export function startSse({ queryClient, onConnect }) {
  let es = null
  let lastEventAt = Date.now()
  let disposed = false
  let rebuildTimer = null
  let rebuildDelay = REBUILD_BASE_DELAY_MS

  function handleInvalidate(event) {
    lastEventAt = Date.now()
    rebuildDelay = REBUILD_BASE_DELAY_MS
    const payload = parseInvalidatePayload(event.data)
    if (!payload) return
    for (const prefix of payload.keys) {
      const segments = splitPrefix(prefix)
      if (segments.length === 0) continue
      const prefixKey = scopeServerPrefix(segments).map(String)
      void queryClient.invalidateQueries({
        predicate: (query) => isPrefixMatch(query.queryKey, prefixKey),
      })
    }
  }

  function scheduleRebuild(reason) {
    if (disposed || rebuildTimer !== null) return
    const delay = rebuildDelay
    rebuildDelay = Math.min(rebuildDelay * 2, REBUILD_MAX_DELAY_MS)
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      open(reason)
    }, delay)
  }

  function open(reason) {
    if (disposed) return
    es?.close()
    lastEventAt = Date.now()
    // The API is cross-origin; without credentials the session cookie isn't sent (→ 401).
    const source = new EventSource(SSE_URL, { withCredentials: true })
    es = source
    source.onopen = () => {
      lastEventAt = Date.now()
      rebuildDelay = REBUILD_BASE_DELAY_MS
    }
    source.addEventListener('invalidate', handleInvalidate)
    source.onmessage = handleInvalidate
    source.onerror = () => {
      if (!disposed && es === source) {
        // Disable EventSource's own fixed-delay retry so all failures use our backoff.
        source.close()
        scheduleRebuild('error-close')
      }
    }
    onConnect?.(reason)
  }

  function onVisibilityChange() {
    if (disposed || document.visibilityState !== 'visible') return
    if (es && es.readyState === EventSource.OPEN && Date.now() - lastEventAt > STALE_AFTER_MS) {
      scheduleRebuild('visibility-stale')
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  open('initial')

  return () => {
    disposed = true
    if (rebuildTimer !== null) {
      clearTimeout(rebuildTimer)
      rebuildTimer = null
    }
    es?.close()
    es = null
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────────────

export function parseInvalidatePayload(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.type !== 'invalidate' || !Array.isArray(parsed.keys)) return null
    return { type: 'invalidate', keys: parsed.keys.filter((key) => typeof key === 'string') }
  } catch {
    return null
  }
}

function splitPrefix(prefix) {
  const trimmed = prefix.trim()
  if (!trimmed) return []
  return trimmed.split(',').map((segment) => segment.trim()).filter((segment) => segment.length > 0)
}

function isPrefixMatch(queryKey, prefixKey) {
  if (queryKey.length < prefixKey.length) return false
  for (let i = 0; i < prefixKey.length; i++) {
    if (String(queryKey[i]) !== prefixKey[i]) return false
  }
  return true
}
