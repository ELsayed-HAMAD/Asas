import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, DollarSign, Clock, UserPlus,
  CreditCard, BarChart2, Receipt, Briefcase, TrendingUp,
  Package, FolderKanban, Settings, HelpCircle, Search,
  ChevronDown, ChevronRight, Bell, Plus, LogOut, Menu,
  ArrowDownCircle, ArrowUpCircle, PieChart, Layers, Map, Zap,
} from 'lucide-react'

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
    children: [
      { label: 'General',        path: '/dashboard/settings' },
      { label: 'Billing & Plans', path: '/dashboard/settings/billing' },
      { label: 'Integrations',   path: '/dashboard/settings/integrations' },
    ],
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
  return pathname === path || pathname.startsWith(path + '/')
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
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
            parentActive
              ? 'text-gray-900 font-medium'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
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
          <div className="ml-4 mt-0.5 border-l border-gray-100 pl-3 space-y-0.5">
            {item.children.map(child => (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={`block px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isChildActive(child.path, pathname)
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        pathname === item.path
          ? 'bg-gray-100 text-gray-900 font-medium'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      <item.icon size={16} />
      {item.label}
    </Link>
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

  // ── Sidebar content (shared between desktop + mobile) ──
  function SidebarContent() {
    return (
      <div className="flex flex-col h-full overflow-hidden">

        {/* Brand */}
        <div className="px-4 py-4 flex items-center gap-3 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
            A
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">Asas</p>
            <p className="text-[11px] text-gray-400">Enterprise ERP</p>
          </div>
        </div>

        {/* Quick action */}
        <div className="px-3 py-3 flex-shrink-0">
          <button className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-800 active:scale-[0.98] transition-all">
            <Plus size={14} />
            New Entry
          </button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <NavItem key={item.id} item={item} {...navProps} />
          ))}
        </nav>

        {/* Bottom navigation */}
        <div className="px-2 py-2 border-t border-gray-100 space-y-0.5 flex-shrink-0">
          {BOTTOM_NAV.map(item => (
            <NavItem key={item.id} item={item} {...navProps} />
          ))}
        </div>

        {/* User profile */}
        <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-700 flex-shrink-0">
              JD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">Jane Doe</p>
              <p className="text-[11px] text-gray-400 truncate">Admin</p>
            </div>
            <button
              onClick={() => navigate('/login')}
              title="Log out"
              className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>

      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-[220px] min-w-[220px] bg-white border-r border-gray-100 flex-col">
        <SidebarContent />
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative z-10 w-[220px] bg-white border-r border-gray-100 flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Right side: topbar + page content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">

          {/* Left: hamburger (mobile only) + breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden text-gray-500 hover:text-gray-900 flex-shrink-0"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm min-w-0">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1 min-w-0">
                  {i > 0 && (
                    <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />
                  )}
                  <span
                    className={`truncate ${
                      i === breadcrumbs.length - 1
                        ? 'font-semibold text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </nav>
          </div>

          {/* Right: search + bell */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* Search (hidden on very small screens) */}
            <div className="relative hidden sm:block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search..."
                className="pl-9 pr-10 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white w-44 transition-all"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded font-mono pointer-events-none">
                ⌘K
              </kbd>
            </div>

            {/* Notifications */}
            <button className="relative p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
              <Bell size={17} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            </button>

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