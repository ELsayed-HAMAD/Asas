/**
 * Server-Sent Events push client.
 *
 * Opens one long-lived `EventSource` to `GET /api/v1/events` and, whenever the server emits an
 * `invalidate` frame (after any successful write mutation in the user's tenant), invalidates the
 * matching TanStack Query caches so every open tab self-heals without polling.
 *
 * Ported from `apps/web/src/lib/sse.ts` (TypeScript) to plain JS. The stringified key prefixes
 * in the frames (e.g. `"asas,finance"`) are the `String()` form of the TanStack Query keys built
 * in `queryKeys.js`.
 */

const SSE_URL = `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/api/v1/events`

/** No frame (data or keepalive comment) for this long → treat an "open" socket as dead. */
const STALE_AFTER_MS = 30_000
/** Delay before rebuilding after a detected hard close, so a flapping link is not tight-looped. */
const REBUILD_DELAY_MS = 1_000

export function startSse({ queryClient, onConnect }) {
  let es = null
  let lastEventAt = Date.now()
  let disposed = false
  let rebuildTimer = null

  function handleInvalidate(event) {
    lastEventAt = Date.now()
    const payload = parseInvalidatePayload(event.data)
    if (!payload) return
    for (const prefix of payload.keys) {
      const prefixKey = splitPrefix(prefix)
      if (prefixKey.length === 0) continue
      void queryClient.invalidateQueries({
        predicate: (query) => isPrefixMatch(query.queryKey, prefixKey),
      })
    }
  }

  function scheduleRebuild(reason) {
    if (disposed || rebuildTimer !== null) return
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      open(reason)
    }, REBUILD_DELAY_MS)
  }

  function open(reason) {
    if (disposed) return
    es?.close()
    lastEventAt = Date.now()
    const source = new EventSource(SSE_URL)
    es = source
    source.addEventListener('invalidate', handleInvalidate)
    source.onmessage = handleInvalidate
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED && !disposed) {
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
