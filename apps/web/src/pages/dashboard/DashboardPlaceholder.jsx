import { useLocation } from 'react-router-dom'

/**
 * Fallback for dashboard routes that do not yet have a dedicated page. Sidebar links and
 * breadcrumbs stay navigable while unmatched paths still render inside the shell.
 */
export default function DashboardPlaceholder() {
  const location = useLocation()
  const path = location.pathname.replace(/^\/dashboard/, '') || '/dashboard'

  return (
    <div className="p-page">
      <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">Unavailable</p>
        <h1 className="text-2xl font-semibold text-heading mb-2">{path}</h1>
        <p className="text-sm text-muted">
          This route does not have a dedicated page yet. The rest of the dashboard remains available.
        </p>
      </div>
    </div>
  )
}
