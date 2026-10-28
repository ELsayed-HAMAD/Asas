import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowLeft,
  Building2,
  CreditCard,
  Database,
  LayoutDashboard,
  Menu,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react'
import { platformApi } from '../lib/api/platform'
import { AsasLogo } from '../components/common/AsasLogo'
import { AdminLoading } from '../components/admin/ui'
import { cn } from '../lib/utils'

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/workspaces', label: 'Workspaces', icon: Building2 },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/billing', label: 'Billing', icon: CreditCard },
  { to: '/admin/health', label: 'Health', icon: Activity },
  { to: '/admin/audit', label: 'Audit', icon: ScrollText },
  { to: '/admin/controls', label: 'Controls', icon: SlidersHorizontal },
]

function pageTitle(pathname) {
  if (pathname.startsWith('/admin/workspaces/')) return 'Workspace detail'
  const match = [...NAV_ITEMS].reverse().find(item => pathname === item.to)
  return match?.label ?? 'Platform console'
}

function SidebarContent({ me, onNavigate }) {
  return (
    <div data-testid="platform-sidebar" className="flex h-full flex-col border-r border-border-subtle bg-white text-body">
      <div className="flex items-center gap-3 px-5 pt-5 pb-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e1b4b] text-white">
          <AsasLogo className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-heading">Asas</p>
          <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted">Platform console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Platform navigation">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-[#eef2ff] font-semibold text-[#1e1b4b] shadow-[inset_0_0_0_1px_rgba(30,27,75,0.06)]'
                  : 'text-body hover:bg-slate-100 hover:text-heading',
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-border-subtle p-3">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-muted transition-colors hover:bg-slate-100 hover:text-heading"
        >
          <ArrowLeft size={15} />
          Back to workspace
        </Link>
        <div className="mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-[11px] font-semibold uppercase text-heading">
            {(me?.name || 'P').slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-heading">{me?.name || 'Platform owner'}</p>
            <p className="truncate text-[10px] text-muted">{me?.platformRole || 'OWNER'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlatformLayout() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: me } = useQuery({
    queryKey: ['platform', 'me'],
    queryFn: platformApi.me,
    staleTime: 60_000,
  })
  const isProduction = me?.isProduction === true

  // The console is a dense operational surface with white cards and a white sidebar.
  // Keep it in light mode while it is open, then restore the workspace theme on exit.
  useEffect(() => {
    const hadDarkTheme = document.documentElement.classList.contains('dark')
    document.documentElement.classList.remove('dark')
    return () => {
      if (hadDarkTheme) document.documentElement.classList.add('dark')
    }
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7] text-body">
      <aside className="hidden w-[236px] shrink-0 lg:block">
        <SidebarContent me={me} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close platform navigation"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 w-[260px] shadow-2xl">
            <SidebarContent me={me} onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              aria-label="Close platform navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-heading"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/70 bg-white/70 px-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open platform navigation"
              className="rounded-xl border border-border-default bg-white/70 p-2 text-body lg:hidden"
            >
              <Menu size={16} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Platform</p>
              <h1 className="truncate text-sm font-semibold text-heading">{pageTitle(location.pathname)}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:flex',
                isProduction ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border-amber-500/20 bg-amber-500/10 text-amber-700',
              )}
              title={me?.nodeEnv ? `API environment: ${me.nodeEnv}` : undefined}
            >
              <ShieldCheck size={11} />
              {isProduction ? 'Production' : 'Development'}
            </span>
            {!isProduction && (
              <span
                className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[10px] font-medium text-muted sm:flex"
                title="Connected to the API development database"
              >
                <Database size={11} /> Development data
              </span>
            )}
            <Link
              to="/dashboard"
              className="rounded-full border border-border-default bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-body transition-colors hover:bg-white"
            >
              Back to workspace
            </Link>
          </div>
        </header>

        <main id="platform-main-content" className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-[1440px]">
            <Suspense fallback={<AdminLoading label="Loading console page..." />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
