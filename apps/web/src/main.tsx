import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { useActiveOrganization } from './lib/authClient.js'
import { initSentry } from './lib/sentry.js'
import { startSse } from './lib/sse.js'
import { ThemeProvider } from './lib/theme.js'
import { router } from './router.js'
import './index.css'

// Initialise error reporting before the first render so early errors are captured. No-ops
// when VITE_SENTRY_DSN is not set.
initSentry()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

/**
 * Opens the SSE invalidation channel once the user is authenticated with an active workspace,
 * and closes it when they are not.
 *
 * Gated on `useActiveOrganization` (not just a session) because the server's SSE endpoint is
 * tenant-scoped — it resolves the workspace from `session.activeOrganizationId`, so a session
 * with no active organization would 401 the stream and `EventSource` would give up permanently.
 * Opening the channel only while an active organization exists means the subscription always
 * matches the tenant the rest of the app is talking to, and it opens/closes automatically as
 * the user signs in, out, or switches workspaces.
 */
function LiveSync() {
  const { data: activeOrganization } = useActiveOrganization()
  const ready = activeOrganization != null

  React.useEffect(() => {
    if (!ready) return
    return startSse({ queryClient })
  }, [ready])

  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
        <LiveSync />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
