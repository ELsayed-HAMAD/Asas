import { useLocation } from 'react-router-dom'

/**
 * Phase-1 placeholder for every dashboard route. Phase 3 replaces this one component with
 * the real pages (ported 1:1 from the legacy app, wired to the API). It exists so the
 * sidebar links and breadcrumbs are navigable while the shell is being verified.
 */
export default function DashboardPlaceholder() {
  const location = useLocation()
  const path = location.pathname.replace(/^\/dashboard/, '') || '/dashboard'

  return (
    <div className="p-page">
      <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">Phase 3</p>
        <h1 className="text-2xl font-semibold text-heading mb-2">{path}</h1>
        <p className="text-sm text-muted">
          This page is a placeholder. The shell, navigation, theming, and authentication are
          live on the new backend — the module pages land next.
        </p>
      </div>
    </div>
  )
}
