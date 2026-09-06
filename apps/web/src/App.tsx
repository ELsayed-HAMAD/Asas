import { Moon, Sun } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { authClient, useActiveOrganization, useSession } from '@/lib/authClient.js'
import { onboardingApi } from '@/lib/api/onboarding.js'
import { useTheme } from '@/lib/theme.js'
import { cn } from '@/lib/utils'

interface NavLeaf {
  to: string
  label: string
}

interface NavGroup {
  group: string
  links: NavLeaf[]
}

const NAV: NavGroup[] = [
  {
    group: 'Dashboard',
    links: [{ to: '/', label: 'Overview' }],
  },
  {
    group: 'HR',
    links: [
      { to: '/hr/employees', label: 'Employees' },
      { to: '/hr/payroll', label: 'Payroll' },
      { to: '/hr/candidates', label: 'Candidates' },
      { to: '/hr/attendance', label: 'Attendance' },
    ],
  },
  {
    group: 'Finance',
    links: [
      { to: '/finance', label: 'Overview' },
      { to: '/finance/payables', label: 'Payables' },
      { to: '/finance/receivables', label: 'Receivables' },
      { to: '/finance/expenses', label: 'Expenses' },
      { to: '/exports', label: 'Exports' },
    ],
  },
  {
    group: 'CRM',
    links: [
      { to: '/crm', label: 'Pipeline' },
      { to: '/crm/deals', label: 'Deals board' },
      { to: '/crm/forecast', label: 'Forecast' },
      { to: '/crm/performance', label: 'Performance' },
    ],
  },
  {
    group: 'Projects',
    links: [
      { to: '/projects', label: 'Portfolio' },
      { to: '/projects/sprints', label: 'Active sprints' },
      { to: '/projects/roadmap', label: 'Roadmap' },
    ],
  },
  {
    group: 'Inventory',
    links: [
      { to: '/inventory', label: 'Products' },
      { to: '/inventory/movements', label: 'Stock movements' },
    ],
  },
  {
    group: 'Settings',
    links: [
      { to: '/settings', label: 'General' },
      { to: '/settings/notifications', label: 'Notifications' },
      { to: '/settings/integrations', label: 'Integrations' },
    ],
  },
]

/**
 * Routed app shell — sidebar navigation over the module surfaces, each backed by a real
 * `/api/v1/*` endpoint. `/` lands on the cross-module dashboard overview.
 *
 * The workspace footer carries the visible "Sample data" label whenever the tenant's
 * `onboardingStatus` is `SAMPLE_LOADED` — the rebuild plan's requirement that sample records
 * can never be mistaken for real ones — alongside the theme toggle and sign out.
 */
export function App() {
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { data: activeOrganization } = useActiveOrganization()
  const { effective, toggle } = useTheme()

  // Sample-data labeling (rebuild plan, Preserve): the status query is tenant-scoped by the
  // session, so the badge only ever reflects the *active* workspace.
  const { data: onboardingStatus } = useQuery({
    queryKey: ['asas', 'onboarding', 'status'],
    queryFn: () => onboardingApi.getStatus(),
    enabled: activeOrganization != null,
  })

  const isSample = onboardingStatus?.onboardingStatus === 'SAMPLE_LOADED'

  async function onSignOut() {
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen">
      <aside className="no-scrollbar sticky top-0 flex h-screen w-[var(--spacing-sidebar)] shrink-0 flex-col gap-5 overflow-y-auto border-r border-[var(--color-border-default)] bg-[var(--color-surface-raised)] p-5">
        <div className="px-1">
          <h1 className="text-lg font-bold text-[var(--color-heading)]">Asas</h1>
          <p className="text-xs text-[var(--color-muted)]">Workplace operating system</p>
        </div>

        <nav className="flex flex-col gap-5">
          {NAV.map(({ group, links }) => (
            <div key={group} className="flex flex-col gap-1">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-caption)]">
                {group}
              </p>
              {links.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-[var(--radius-button)] px-2 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-[var(--color-surface-active)] font-medium text-[var(--color-heading)]'
                        : 'text-[var(--color-body)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

          <div className="mt-auto flex flex-col gap-2 border-t border-[var(--color-border-default)] pt-4">
            {activeOrganization && (
              <div className="flex items-center gap-2 px-2">
                <p className="truncate text-xs text-[var(--color-muted)]" title={activeOrganization.name}>
                  {activeOrganization.name}
                </p>
                {isSample && <Badge variant="warning">Sample data</Badge>}
              </div>
            )}
            {session?.user?.email && (
              <p className="truncate px-2 text-xs text-[var(--color-caption)]" title={session.user.email}>
                {session.user.email}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggle}
                aria-label={effective === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={effective === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {effective === 'dark' ? <Sun /> : <Moon />}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onSignOut}>
                Sign out
              </Button>
            </div>
          </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
