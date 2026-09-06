import type { QueryClient } from '@tanstack/react-query'

/**
 * Server-Sent Events push client (rebuild plan, Phase 7).
 *
 * Opens one long-lived `EventSource` to `GET /api/v1/events` and, whenever the server emits an
 * `invalidate` frame (after any successful write mutation in the user's tenant), invalidates the
 * matching TanStack Query caches so every open tab self-heals without polling.
 *
 * **Transport.** The stream is `text/event-stream` over the session cookie — `EventSource` is
 * the only browser API that can consume it, and it sends cookies automatically (the API's CORS
 * is configured with `credentials: true`, so cross-origin in dev works). The server frames look
 * like:
 *
 * ```
 * event: invalidate
 * data: {"type":"invalidate","keys":["asas,finance"]}
 * ```
 *
 * `keys` are the *stringified* TanStack Query key prefixes (a key `[ 'asas', 'finance' ]`
 * stringifies to exactly `'asas,finance'` — see the API's `moduleKeyPrefix`). The client splits
 * them back into arrays and invalidates by prefix match, so one prefix refreshes the whole
 * module's subtree.
 *
 * **Reconnect.** `EventSource` natively reconnects on network errors with its own backoff.
 * This adds the two cases native behaviour does not cover:
 *
 * - **The browser gives up** (state → `CLOSED`). On that `error` event we rebuild the socket
 *   ourselves after a short delay so a hard failure does not leave the channel dead.
 * - **A silently dropped "open" connection.** Some proxies kill a `text/event-stream` without
 *   an error event. The server sends a comment keepalive every 25 s; when the tab returns to
 *   the foreground with no frame received for `STALE_AFTER_MS`, the socket is considered dead
 *   and rebuilt.
 *
 * **Auth.** The caller (a component, see `main.tsx`) opens the channel only while the user has
 * a session with an active organization and closes it on sign-out. The handler is therefore
 * always authenticated: the server's `requireRole('MEMBER')` guard would 401 it otherwise, and
 * `EventSource` does not retry on HTTP errors — it closes permanently.
 */

// Same base as `lib/api/http.ts` — the SSE endpoint lives at `/api/v1/events` on the API.
const SSE_URL = `${import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4000'}/api/v1/events`

/** No frame (data or keepalive comment) for this long → treat an "open" socket as dead. */
const STALE_AFTER_MS = 30_000
/** Delay before rebuilding after a detected hard close, so a flapping link is not tight-looped. */
const REBUILD_DELAY_MS = 1_000

export interface StartSseOptions {
  /** The query client to invalidate against when an `invalidate` frame arrives. */
  queryClient: QueryClient
  /** Called once per successful (re)connect; useful for logging/telemetry. */
  onConnect?: (reason: 'initial' | 'error-close' | 'visibility-stale') => void
}

/**
 * Start the SSE channel. Returns a cleanup function that closes the socket and removes all
 * listeners — call it in an effect's teardown (or on sign-out).
 */
export function startSse({ queryClient, onConnect }: StartSseOptions): () => void {
  let es: EventSource | null = null
  let lastEventAt = Date.now()
  let disposed = false
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null

  function handleInvalidate(event: MessageEvent): void {
    lastEventAt = Date.now()
    const payload = parseInvalidatePayload(event.data)
    if (!payload) return
    for (const prefix of payload.keys) {
      const prefixKey = splitPrefix(prefix)
      if (prefixKey.length === 0) continue
      // Prefix match: any cache whose key starts with `prefixKey` is stale. A TanStack key's
      // `String()` form is its comma-joined segments, so string equality per element is the
      // exact inverse of how the server built the prefix.
      void queryClient.invalidateQueries({
        predicate: (query) => isPrefixMatch(query.queryKey, prefixKey),
      })
    }
  }

  function scheduleRebuild(reason: 'error-close' | 'visibility-stale'): void {
    if (disposed || rebuildTimer !== null) return
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      open(reason)
    }, REBUILD_DELAY_MS)
  }

  function open(reason: 'initial' | 'error-close' | 'visibility-stale'): void {
    if (disposed) return
    es?.close()
    lastEventAt = Date.now()
    const source = new EventSource(SSE_URL)
    es = source
    // The server sends named `event: invalidate` frames, which need a matching listener; the
    // default `message` listener is kept as a belt-and-braces for unnamed frames.
    source.addEventListener('invalidate', handleInvalidate)
    source.onmessage = handleInvalidate
    source.onerror = () => {
      // READY_STATE: 0 CONNECTING, 1 OPEN, 2 CLOSED. While the browser is still retrying we
      // let it keep its own backoff; if it has given up, we rebuild ourselves.
      if (source.readyState === EventSource.CLOSED && !disposed) {
        scheduleRebuild('error-close')
      }
    }
    onConnect?.(reason)
  }

  // Rebuild if the connection went stale while the tab was hidden (a proxy may have dropped it
  // without an error event). Checked only when the tab becomes visible: no polling.
  function onVisibilityChange(): void {
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

/** Parse an `invalidate` frame's JSON payload back into `{ type, keys }`. */
export function parseInvalidatePayload(
  raw: string,
): { type: 'invalidate'; keys: string[] } | null {
  try {
    const parsed = JSON.parse(raw) as { type?: unknown; keys?: unknown }
    if (parsed?.type !== 'invalidate' || !Array.isArray(parsed.keys)) return null
    return { type: 'invalidate', keys: parsed.keys.filter((key): key is string => typeof key === 'string') }
  } catch {
    return null
  }
}

/** `'asas,finance'` → `['asas', 'finance']`. Empty/whitespace → `[]`. */
function splitPrefix(prefix: string): string[] {
  const trimmed = prefix.trim()
  if (!trimmed) return []
  return trimmed.split(',').map((segment) => segment.trim()).filter((segment) => segment.length > 0)
}

/** True when `queryKey` starts with `prefixKey` element-wise. */
function isPrefixMatch(queryKey: readonly unknown[], prefixKey: readonly string[]): boolean {
  if (queryKey.length < prefixKey.length) return false
  for (let i = 0; i < prefixKey.length; i++) {
    if (String(queryKey[i]) !== prefixKey[i]) return false
  }
  return true
}
