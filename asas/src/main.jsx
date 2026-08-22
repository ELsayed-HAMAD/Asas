import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)