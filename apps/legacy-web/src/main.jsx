import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { useSession, useActiveOrganization } from './lib/authClient'
import { startSse } from './lib/sse'
import { setFormatDefaults } from './lib/format'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { this.setState({ errorInfo }); }
  render() {
    if (this.state.hasError) {
      const showDetail = import.meta.env.DEV
      return (
        <div style={{ padding: '2rem', fontFamily: 'system-ui', color: '#7f1d1d', backgroundColor: '#fef2f2', minHeight: '100vh' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Something went wrong</h1>
          <p>Reload the page. If this keeps happening, sign out and sign back in.</p>
          {showDetail && (
            <pre style={{ overflowX: 'auto', background: '#fff', padding: '1rem', marginTop: '1rem', fontSize: '12px', color: '#333' }}>
              {this.state.error && this.state.error.toString()}
              {'\n'}
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // cache data for 5 minutes
      retry: 1,                  // retry failed requests once
    },
  },
})

/**
 * Opens the SSE invalidation channel once the user is authenticated with an active workspace,
 * and closes it when they are not.
 *
 * Gated on the active organization (not just a session) because the server's SSE endpoint is
 * tenant-scoped — it resolves the workspace from `session.activeOrganizationId`, so a session
 * with no active organization would 401 the stream and `EventSource` would give up permanently.
 *
 * It also seeds the app-wide money formatter with the workspace's currency, so every
 * `formatMoney` call renders in the tenant's currency without each page passing it.
 */
function LiveSync() {
  const { data: session } = useSession()
  const { data: activeOrganization } = useActiveOrganization()
  const ready = Boolean(session && activeOrganization)

  React.useEffect(() => {
    if (!ready || !activeOrganization) return
    setFormatDefaults({ currency: activeOrganization.currency })
    return startSse({ queryClient })
  }, [ready, activeOrganization?.id])

  return null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <LiveSync />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
