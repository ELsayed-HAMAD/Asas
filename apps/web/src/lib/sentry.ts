import * as Sentry from '@sentry/react'

/**
 * Sentry for the web (rebuild plan, Phase 7).
 *
 * **Initialised only when `VITE_SENTRY_DSN` is set** — without a DSN {@link initSentry} returns
 * immediately and `Sentry.init` is never called, so no events are ever sent and no tracing is
 * installed. A local dev box with no Sentry project therefore ships the SDK (inert) but behaves
 * exactly as if it were absent. The DSN is read from `import.meta.env` (Vite convention — only
 * `VITE_`-prefixed vars are inlined); it is inlined at build time and thus visible in the
 * bundle, which is acceptable for a Sentry DSN (a write token for this project only) but is
 * *not* the pattern for any other secret.
 *
 * `initSentry` is called once from `main.tsx`, before the first render, so uncaught errors and
 * route transitions from the very first interaction are captured. The default integrations
 * (browser tracing, captureConsole, etc.) are used; per-route tracing is left as a follow-on
 * rather than a boot-time dependency.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE ?? 'development',
    // Production gets a real tracing sample; dev defaults to none to avoid noise.
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 0,
  })
}
