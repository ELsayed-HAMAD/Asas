import {
  Bell, Check, ChevronDown, ChevronRight, FolderKanban, HelpCircle, LayoutDashboard,
  Menu, Moon, Package, Plus, Settings, Sun, Users, BriefcaseBusiness, CreditCard,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { authClient, useActiveOrganization, useSession } from '@/lib/authClient.js'
import { onboardingApi } from '@/lib/api/onboarding.js'
import { useTheme } from '@/lib/theme.js'
import { cn } from '@/lib/utils'

interface NavItem {
  id: string
  label: string
  icon: typeof LayoutDashboard
  to?: string
  children?: { label: string; to: string }[]
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { id: 'hr', label: 'HR', icon: Users, children: [
    { label: 'Employee Directory', to: '/hr/employees' }, { label: 'Payroll', to: '/hr/payroll' },
    { label: 'Time & Attendance', to: '/hr/attendance' }, { label: 'Recruitment', to: '/hr/candidates' },
  ] },
  { id: 'finance', label: 'Finance', icon: CreditCard, children: [
    { label: 'Overview', to: '/finance' }, { label: 'Accounts Payable', to: '/finance/payables' },
    { label: 'Accounts Receivable', to: '/finance/receivables' }, { label: 'Expenses', to: '/finance/expenses' },
  ] },
  { id: 'crm', label: 'CRM', icon: BriefcaseBusiness, children: [
    { label: 'Overview', to: '/crm' }, { label: 'Deals Pipeline', to: '/crm/deals' },
    { label: 'Sales Performance', to: '/crm/performance' }, { label: 'Revenue Forecast', to: '/crm/forecast' },
  ] },
  { id: 'inventory', label: 'Inventory', icon: Package, children: [
    { label: 'Products', to: '/inventory' }, { label: 'Stock Movements', to: '/inventory/movements' },
  ] },
  { id: 'projects', label: 'Projects', icon: FolderKanban, children: [
    { label: 'Portfolio', to: '/projects' }, { label: 'Active Sprints', to: '/projects/sprints' },
    { label: 'Roadmap', to: '/projects/roadmap' },
  ] },
]

const BOTTOM_NAV = [
  { id: 'settings', label: 'Settings', icon: Settings, to: '/settings' },
  { id: 'support', label: 'Support', icon: HelpCircle, to: '/settings' },
]

function isActive(item: NavItem, pathname: string): boolean {
  if (item.to) return pathname === item.to
  return item.children?.some(child => pathname === child.to || pathname.startsWith(`${child.to}/`)) ?? false
}

function labelForPath(pathname: string): string[] {
  const match = [...NAV.flatMap(item => item.children ?? []), ...BOTTOM_NAV]
    .find(item => pathname === item.to || pathname.startsWith(`${item.to}/`))
  return match ? [match.label] : ['Dashboard']
}

export function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: session } = useSession()
  const { data: activeOrganization } = useActiveOrganization()
  const { effective, toggle } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  const { data: onboardingStatus } = useQuery({
    queryKey: ['asas', 'onboarding', 'status'],
    queryFn: () => onboardingApi.getStatus(),
    enabled: activeOrganization != null,
  })
  const isSample = onboardingStatus?.onboardingStatus === 'SAMPLE_LOADED'
  const crumbs = useMemo(() => ['Dashboard', ...labelForPath(location.pathname)], [location.pathname])

  useEffect(() => {
    for (const item of NAV) {
      if (item.children?.some(child => location.pathname.startsWith(child.to))) {
        setOpenSections(previous => ({ ...previous, [item.id]: true }))
      }
    }
    setMobileOpen(false)
  }, [location.pathname])

  async function onSignOut() {
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  function renderNavItem(item: NavItem) {
    const Icon = item.icon
    const active = isActive(item, location.pathname)
    if (!item.children) {
      return <NavLink key={item.id} to={item.to!} className={cn('flex items-center gap-3 rounded-[var(--radius-button)] px-3 py-2 text-sm transition-colors', active ? 'bg-[var(--color-surface-active)] font-semibold text-[var(--color-heading)]' : 'text-[var(--color-body)] hover:bg-[var(--color-surface-muted)]')}><Icon size={16} />{item.label}</NavLink>
    }
    const open = openSections[item.id] ?? active
    return <div key={item.id}>
      <button type="button" onClick={() => setOpenSections(previous => ({ ...previous, [item.id]: !open }))} className={cn('flex w-full items-center justify-between rounded-[var(--radius-button)] px-3 py-2 text-sm transition-colors', active ? 'font-semibold text-[var(--color-heading)]' : 'text-[var(--color-body)] hover:bg-[var(--color-surface-muted)]')}>
        <span className="flex items-center gap-3"><Icon size={16} />{item.label}</span>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="ml-7 mt-0.5 space-y-0.5 border-l border-[var(--color-border-subtle)] pl-2">{item.children.map(child => <NavLink key={child.to} to={child.to} className={({ isActive: childActive }) => cn('block rounded-[var(--radius-button)] px-3 py-1.5 text-sm', childActive ? 'bg-[var(--color-surface-active)] font-medium text-[var(--color-heading)]' : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-muted)]')}>{child.label}</NavLink>)}</div>}
    </div>
  }

  const sidebar = <div className="flex h-full flex-col">
    <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-4 py-4"><div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-button)] bg-[var(--color-primary)] text-sm font-bold text-[var(--color-on-primary)]">A</div><div className="min-w-0"><p className="text-sm font-semibold text-[var(--color-heading)]">Asas</p><p className="truncate text-[11px] text-[var(--color-caption)]">{activeOrganization?.name ?? 'Enterprise ERP'}</p></div></div>
    <div className="px-3 py-3"><Button className="w-full justify-center"><Plus size={14} /> New Entry</Button></div>
    <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-2">{NAV.map(renderNavItem)}</nav>
    <div className="space-y-1 border-t border-[var(--color-border-subtle)] px-2 py-2">{BOTTOM_NAV.map(item => <NavLink key={item.id} to={item.to} className={({ isActive: active }) => cn('flex items-center gap-3 rounded-[var(--radius-button)] px-3 py-2 text-sm', active ? 'bg-[var(--color-surface-active)] font-semibold text-[var(--color-heading)]' : 'text-[var(--color-body)] hover:bg-[var(--color-surface-muted)]')}><item.icon size={16} />{item.label}</NavLink>)}</div>
    <div className="border-t border-[var(--color-border-subtle)] px-3 py-3"><div className="flex items-center gap-2 rounded-[var(--radius-button)] p-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-strong)] text-xs font-bold text-[var(--color-body)]">{session?.user?.name?.slice(0, 1).toUpperCase() ?? 'U'}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--color-heading)]">{session?.user?.name ?? 'User'}</p><p className="truncate text-[11px] text-[var(--color-caption)]">{session?.user?.email ?? ''}</p></div></div><div className="mt-2 flex items-center gap-1"><Button type="button" variant="ghost" size="icon" onClick={toggle} title="Toggle theme">{effective === 'dark' ? <Sun /> : <Moon />}</Button><Button type="button" variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button></div>{isSample && <Badge variant="warning" className="mt-2">Sample data</Badge>}</div>
  </div>

  return <div className="flex h-screen overflow-hidden bg-[var(--color-surface)]"><aside className="hidden w-64 shrink-0 border-r border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] md:flex">{sidebar}</aside>{mobileOpen && <div className="fixed inset-0 z-50 flex md:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-[var(--color-overlay)]" onClick={() => setMobileOpen(false)} /><aside className="relative z-10 w-64 bg-[var(--color-surface-raised)]">{sidebar}</aside></div>}<div className="flex min-w-0 flex-1 flex-col"><header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-4 md:px-6"><div className="flex min-w-0 items-center gap-3"><Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}><Menu /></Button><nav className="flex items-center gap-1 text-sm">{crumbs.map((crumb, index) => <span key={`${crumb}-${index}`} className="flex items-center gap-1">{index > 0 && <ChevronRight size={13} className="text-[var(--color-faint)]" />}<span className={index === crumbs.length - 1 ? 'font-semibold text-[var(--color-heading)]' : 'text-[var(--color-caption)]'}>{crumb}</span></span>)}</nav></div><Button type="button" variant="ghost" size="icon" title="Notifications"><Bell size={17} /></Button></header><main className="min-w-0 flex-1 overflow-y-auto"><Outlet /></main></div></div>
}
