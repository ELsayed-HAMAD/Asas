import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, DollarSign, Clock, UserPlus,
  CreditCard, BarChart2, Receipt, Briefcase, TrendingUp,
  Package, FolderKanban, Settings, HelpCircle, Search,
  ChevronDown, ChevronRight, Bell, Plus, LogOut, Menu,
  ArrowDownCircle, ArrowUpCircle, PieChart, Layers, Map, Zap,
} from 'lucide-react'
import { motion } from 'framer-motion'

// ── Navigation config ──────────────────────────────────────
const NAV = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
  },
  {
    id: 'hr',
    label: 'HR',
    icon: Users,
    children: [
      { label: 'Employee Directory', path: '/dashboard/hr/employees' },
      { label: 'Payroll',            path: '/dashboard/hr/payroll' },
      { label: 'Time & Attendance',  path: '/dashboard/hr/time-attendance' },
      { label: 'Recruitment',        path: '/dashboard/hr/recruitment' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: CreditCard,
    children: [
      { label: 'Overview',              path: '/dashboard/finance' },
      { label: 'Accounts Payable',      path: '/dashboard/finance/accounts-payable' },
      { label: 'Accounts Receivable',   path: '/dashboard/finance/accounts-receivable' },
      { label: 'Expenses',              path: '/dashboard/finance/expenses' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    icon: Briefcase,
    children: [
      { label: 'Overview',          path: '/dashboard/crm' },
      { label: 'Deals Pipeline',    path: '/dashboard/crm/deals' },
      { label: 'Sales Performance', path: '/dashboard/crm/sales-performance' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    path: '/dashboard/inventory',
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderKanban,
    children: [
      { label: 'Portfolio',      path: '/dashboard/projects' },
      { label: 'Active Sprints', path: '/dashboard/projects/sprints' },
      { label: 'Roadmap',        path: '/dashboard/projects/roadmap' },
    ],
  },
]

const BOTTOM_NAV = [
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/dashboard/settings',
  },
  {
    id: 'support',
    label: 'Support',
    icon: HelpCircle,
    path: '/dashboard/support',
  },
]

// ── Breadcrumb label map ────────────────────────────────────
const BREADCRUMB_LABELS = {
  dashboard:             'Dashboard',
  hr:                    'HR',
  employees:             'Employee Directory',
  payroll:               'Payroll',
  'time-attendance':     'Time & Attendance',
  recruitment:           'Recruitment',
  finance:               'Finance',
  'accounts-payable':    'Accounts Payable',
  'accounts-receivable': 'Accounts Receivable',
  expenses:              'Expenses',
  crm:                   'CRM',
  deals:                 'Deals Pipeline',
  'sales-performance':   'Sales Performance',
  inventory:             'Inventory',
  projects:              'Projects',
  sprints:               'Active Sprints',
  roadmap:               'Roadmap',
  settings:              'Settings',
  billing:               'Billing & Plans',
  integrations:          'Integrations',
  support:               'Support',
}

// ── Helpers ────────────────────────────────────────────────
function isChildActive(path, pathname) {
  if (pathname === path) return true
  
  const segments = path.split('/').filter(Boolean)
  // If it's a category root like /dashboard/finance, require an exact match
  if (segments.length <= 2) return false
  
  return pathname.startsWith(path + '/')
}

function isParentActive(item, pathname) {
  if (item.path) return pathname === item.path
  if (item.children) return item.children.some(c => isChildActive(c.path, pathname))
  return false
}

// ── NavItem component ──────────────────────────────────────
function NavItem({ item, pathname, openSections, toggleSection, onNavigate }) {
  const hasChildren = Boolean(item.children)
  const isOpen      = openSections[item.id]
  const parentActive = isParentActive(item, pathname)

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => toggleSection(item.id)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-button text-sm transition-colors ${
            parentActive
              ? 'text-heading font-medium'
              : 'text-muted hover:text-heading hover:bg-surface-muted'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <item.icon size={16} />
            {item.label}
          </div>
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="ml-4 mt-0.5 border-l border-border-subtle pl-3 space-y-0.5">
            {item.children.map(child => {
              const isActive = isChildActive(child.path, pathname)
              return (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={`relative block px-3 py-1.5 rounded-button text-sm transition-colors ${
                  isActive
                    ? 'bg-surface-active text-heading font-medium'
                    : 'text-muted hover:text-heading hover:bg-surface-muted'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-[6px] bottom-[6px] w-[3px] bg-primary rounded-r-full"
                  />
                )}
                {child.label}
              </Link>
            )})}
          </div>
        )}
      </div>
    )
  }

  const isActive = pathname === item.path
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-button text-sm transition-colors ${
        isActive
          ? 'bg-surface-active text-heading font-medium'
          : 'text-muted hover:text-heading hover:bg-surface-muted'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-indicator"
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r-full"
        />
      )}
      <item.icon size={16} />
      {item.label}
    </Link>
  )
}

// ── Sidebar Content Component ────────────────────────────────
function SidebarContent({ navProps, navigate }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      
      {/* Brand */}
      <div className="px-4 py-4 flex items-center gap-3 border-b border-border-subtle flex-shrink-0">
        <div className="w-8 h-8 rounded-button bg-primary text-on-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
          A
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-heading leading-tight">Asas</p>
          <p className="text-[11px] text-caption">Enterprise ERP</p>
        </div>
      </div>

      {/* Quick action */}
      <div className="px-3 py-3 flex-shrink-0">
        <button className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary text-sm font-medium px-3 py-2 rounded-button hover:bg-primary-hover active:scale-[0.98] transition-all">
          <Plus size={14} />
          New Entry
        </button>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto no-scrollbar">
        {NAV.map(item => (
          <NavItem key={item.id} item={item} {...navProps} />
        ))}
      </nav>

      {/* Bottom navigation */}
      <div className="px-2 py-2 border-t border-border-subtle space-y-0.5 flex-shrink-0">
        {BOTTOM_NAV.map(item => (
          <NavItem key={item.id} item={item} {...navProps} />
        ))}
      </div>

      {/* User profile */}
      <div className="px-3 py-3 border-t border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-surface-strong flex items-center justify-center text-xs font-semibold text-body flex-shrink-0">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-heading truncate">Jane Doe</p>
            <p className="text-[11px] text-caption truncate">Admin</p>
          </div>
          <button
            onClick={() => navigate('/login')}
            title="Log out"
            className="text-caption hover:text-body transition-colors p-1 rounded"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

    </div>
  )
}

// ── Main Layout ────────────────────────────────────────────
export default function DashboardLayout() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const pathname  = location.pathname

  const [openSections, setOpenSections]         = useState({})
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Auto-expand the section that contains the current route
  useEffect(() => {
    const allItems = [...NAV, ...BOTTOM_NAV]
    const updates  = {}
    allItems.forEach(item => {
      if (item.children) {
        const active = item.children.some(c => isChildActive(c.path, pathname))
        if (active) updates[item.id] = true
      }
    })
    setOpenSections(prev => ({ ...prev, ...updates }))
  }, [pathname])

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [pathname])

  const toggleSection = id =>
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))

  // Build breadcrumbs from pathname
  const breadcrumbs = pathname
    .split('/')
    .filter(Boolean)
    .map(seg => BREADCRUMB_LABELS[seg] || seg)

  const navProps = { pathname, openSections, toggleSection, onNavigate: () => setMobileSidebarOpen(false) }



  return (
    <div className="flex h-screen bg-surface overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-55 min-w-55 bg-surface-raised border-r border-border-subtle flex-col">
        <SidebarContent navProps={navProps} navigate={navigate} />
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-overlay backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative z-10 w-55 bg-surface-raised border-r border-border-subtle flex flex-col">
            <SidebarContent navProps={navProps} navigate={navigate} />
          </aside>
        </div>
      )}

      {/* ── Right side: topbar + page content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <header className="bg-surface-raised border-b border-border-subtle px-4 md:px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">

          {/* Left: hamburger (mobile only) + breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden text-muted hover:text-heading flex-shrink-0"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm min-w-0">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1 min-w-0">
                  {i > 0 && (
                    <ChevronRight size={13} className="text-faint flex-shrink-0" />
                  )}
                  <span
                    className={`truncate ${
                      i === breadcrumbs.length - 1
                        ? 'font-semibold text-heading'
                        : 'text-caption'
                    }`}
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </nav>
          </div>

          {/* Right: dynamically injected page controls */}
          <div id="topbar-actions-portal" className="flex items-center gap-2 flex-shrink-0 min-h-[32px]">
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

      </div>
    </div>
  )
}