import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, CreditCard, Briefcase,
  Package, FolderKanban, Settings, HelpCircle,
  ChevronDown, ChevronLeft, ChevronRight, Plus, LogOut, Menu,
  Check, User, Moon, Download, Search, Globe, Mail, Building2
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { changeLanguage } from '../lib/i18n'
import { validatePasswordPolicy } from '../lib/passwordPolicy'
import {
  authClient, useSession, useActiveOrganization, useActiveMemberRole,
  useListOrganizations, signOut
} from '../lib/authClient'
import FormDialog from '../components/common/FormDialog'
import CommandPalette from '../components/CommandPalette'
import NotificationPopover from '../components/NotificationPopover'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
} from '../components/ui/dialog'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb'
import { Kbd } from '../components/ui/kbd'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '../components/ui/tooltip'

// ── Navigation config ──────────────────────────────────────
const NAV = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    i18nKey: 'nav.dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
  },
  {
    id: 'hr',
    label: 'HR',
    i18nKey: 'nav.hr',
    icon: Users,
    children: [
      { label: 'Employee Directory', i18nKey: 'nav.employees', path: '/dashboard/hr/employees' },
      { label: 'Payroll',            i18nKey: 'nav.payroll', path: '/dashboard/hr/payroll' },
      { label: 'Time & Attendance',  i18nKey: 'nav.timeAttendance', path: '/dashboard/hr/time-attendance' },
      { label: 'Time Off & Leave',   i18nKey: 'nav.timeOff', path: '/dashboard/hr/time-off' },
      { label: 'Recruitment',        i18nKey: 'nav.recruitment', path: '/dashboard/hr/recruitment' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    i18nKey: 'nav.finance',
    icon: CreditCard,
    children: [
      { label: 'Overview',              i18nKey: 'finance.overview', path: '/dashboard/finance' },
      { label: 'Accounts Payable',      i18nKey: 'nav.accountsPayable', path: '/dashboard/finance/accounts-payable' },
      { label: 'Accounts Receivable',   i18nKey: 'nav.accountsReceivable', path: '/dashboard/finance/accounts-receivable' },
      { label: 'Expenses',              i18nKey: 'nav.expenses', path: '/dashboard/finance/expenses' },
      { label: 'Bank Reconciliation',   i18nKey: 'finance.reconciliation', path: '/dashboard/finance/reconciliation' },
      { label: 'Trial Balance',         i18nKey: 'nav.trialBalance', path: '/dashboard/finance/trial-balance' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    i18nKey: 'nav.crm',
    icon: Briefcase,
    children: [
      { label: 'Overview',          i18nKey: 'crm.overview', path: '/dashboard/crm' },
      { label: 'Deals Pipeline',    i18nKey: 'nav.deals', path: '/dashboard/crm/deals' },
      { label: 'Sales Performance', i18nKey: 'nav.salesPerformance', path: '/dashboard/crm/sales-performance' },
      { label: 'Revenue Forecast',  i18nKey: 'nav.revenueForecast', path: '/dashboard/crm/revenue-forecast' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    i18nKey: 'nav.inventory',
    icon: Package,
    children: [
      { label: 'Product Catalog', i18nKey: 'nav.productCatalog', path: '/dashboard/inventory' },
      { label: 'Stock Movements', i18nKey: 'nav.stockMovements', path: '/dashboard/inventory/movements' },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    i18nKey: 'nav.projects',
    icon: FolderKanban,
    children: [
      { label: 'Portfolio',      i18nKey: 'nav.portfolio', path: '/dashboard/projects' },
      { label: 'Active Sprints', i18nKey: 'nav.activeSprints', path: '/dashboard/projects/sprints' },
      { label: 'Roadmap',        i18nKey: 'nav.roadmap', path: '/dashboard/projects/roadmap' },
    ],
  },
]

const BOTTOM_NAV = [
  {
    id: 'settings',
    label: 'Settings',
    i18nKey: 'nav.settings',
    icon: Settings,
    path: '/dashboard/settings',
  },
  {
    id: 'support',
    label: 'Support',
    i18nKey: 'nav.support',
    icon: HelpCircle,
    path: '/dashboard/support',
  },
  {
    id: 'exports',
    label: 'Exports',
    i18nKey: 'nav.dataExport',
    icon: Download,
    path: '/dashboard/exports',
  },
]

// ── Breadcrumb label map ────────────────────────────────────
const BREADCRUMB_LABELS = {
  dashboard:             'Dashboard',
  hr:                    'HR',
  employees:             'Employee Directory',
  payroll:               'Payroll',
  'time-attendance':     'Time & Attendance',
  'time-off':            'Time Off & Leave',
  recruitment:           'Recruitment',
  finance:               'Finance',
  'accounts-payable':    'Accounts Payable',
  'accounts-receivable': 'Accounts Receivable',
  expenses:              'Expenses',
  'trial-balance':        'Trial Balance',
  crm:                   'CRM',
  deals:                 'Deals Pipeline',
  'sales-performance':   'Sales Performance',
  'revenue-forecast':    'Revenue Forecast',
  inventory:             'Inventory',
  movements:             'Stock Movements',
  projects:              'Projects',
  sprints:               'Active Sprints',
  roadmap:               'Roadmap',
  settings:              'Settings',
  members:               'Members & Roles',
  billing:               'Billing & Plans',
  integrations:          'Integrations',
  notifications:         'Notifications',
  'data-export':         'Data Export',
  exports:               'Data Export',
  support:               'Support',
}

const BREADCRUMB_I18N = {
  dashboard:             'nav.dashboard',
  hr:                    'nav.hr',
  employees:             'nav.employees',
  payroll:               'nav.payroll',
  'time-attendance':     'nav.timeAttendance',
  'time-off':            'nav.timeOff',
  recruitment:           'nav.recruitment',
  finance:               'nav.finance',
  'accounts-payable':    'nav.accountsPayable',
  'accounts-receivable': 'nav.accountsReceivable',
  expenses:              'nav.expenses',
  'trial-balance':       'nav.trialBalance',
  crm:                   'nav.crm',
  deals:                 'nav.deals',
  'sales-performance':   'nav.salesPerformance',
  'revenue-forecast':    'nav.revenueForecast',
  inventory:             'nav.inventory',
  movements:             'nav.stockMovements',
  projects:              'nav.projects',
  sprints:               'nav.activeSprints',
  roadmap:               'nav.roadmap',
  settings:              'nav.settings',
  members:               'nav.members',
  billing:               'nav.billing',
  integrations:          'nav.integrations',
  notifications:         'nav.notifications',
  'data-export':         'nav.dataExport',
  exports:               'nav.dataExport',
  support:               'nav.support',
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
function NavItem({ item, pathname, openSections, toggleSection, onNavigate, t, isCollapsed }) {
  const hasChildren = Boolean(item.children)
  const isOpen      = openSections[item.id]
  const parentActive = isParentActive(item, pathname)
  const itemLabel   = item.i18nKey && t ? t(item.i18nKey, item.label) : item.label

  if (isCollapsed) {
    if (hasChildren) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to={item.children[0].path}
              onClick={onNavigate}
              data-active={parentActive ? "true" : undefined}
              aria-label={itemLabel}
              className={`relative flex items-center justify-center h-10 min-h-[40px] max-h-[40px] rounded-button text-sm transition-micro ${
                parentActive
                  ? 'bg-surface-active text-heading font-medium'
                  : 'text-muted hover:text-heading hover:bg-surface-muted'
              }`}
            >
              {parentActive && (
                <div
                  className="absolute start-0 top-2 bottom-2 w-[3px] bg-accent rounded-e-full animate-scale-in"
                />
              )}
              <item.icon size={18} />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">
            {itemLabel}
          </TooltipContent>
        </Tooltip>
      )
    }

    const isActive = pathname === item.path
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={item.path}
            onClick={onNavigate}
            data-active={isActive ? "true" : undefined}
            aria-label={itemLabel}
            className={`relative flex items-center justify-center h-10 min-h-[40px] max-h-[40px] rounded-button text-sm transition-micro ${
              isActive
                ? 'bg-surface-active text-heading font-medium'
                : 'text-muted hover:text-heading hover:bg-surface-muted'
            }`}
          >
            {isActive && (
              <div
                className="absolute start-0 top-2 bottom-2 w-[3px] bg-accent rounded-e-full animate-scale-in"
              />
            )}
            <item.icon size={18} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">
          {itemLabel}
        </TooltipContent>
      </Tooltip>
    )
  }

  if (hasChildren) {
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleSection(item.id)}
          aria-expanded={Boolean(isOpen)}
          className={`w-full h-10 min-h-[40px] max-h-[40px] flex items-center justify-between px-3 rounded-button text-sm transition-micro cursor-pointer ${
            parentActive
              ? 'text-heading font-medium'
              : 'text-muted hover:text-heading hover:bg-surface-muted'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <item.icon size={18} />
            <span>{itemLabel}</span>
          </div>
          <ChevronDown
            size={13}
            className={`transition-transform duration-300 ease-out flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="ms-4.5 mt-0.5 border-s-2 border-border-subtle/80 ps-2.5 space-y-0.5">
            {item.children.map(child => {
              const isActive = isChildActive(child.path, pathname)
              const childLabel = child.i18nKey && t ? t(child.i18nKey, child.label) : child.label
              return (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                data-active={isActive ? "true" : undefined}
                className={`relative flex items-center h-[34px] min-h-[34px] max-h-[34px] px-2.5 rounded-button text-[13px] leading-none transition-micro ${
                  isActive
                    ? 'bg-surface-active text-heading font-medium'
                    : 'text-muted hover:text-heading hover:bg-surface-muted'
                }`}
              >
                {isActive && (
                  <div
                    className="absolute start-0 top-1.5 bottom-1.5 w-[2.5px] bg-accent rounded-e-full animate-scale-in"
                  />
                )}
                {childLabel}
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
      data-active={isActive ? "true" : undefined}
      className={`relative flex items-center gap-2.5 h-10 min-h-[40px] max-h-[40px] px-3 rounded-button text-sm transition-micro ${
        isActive
          ? 'bg-surface-active text-heading font-medium'
          : 'text-muted hover:text-heading hover:bg-surface-muted'
      }`}
    >
      {isActive && (
        <div
          className="absolute start-0 top-2 bottom-2 w-[3px] bg-accent rounded-e-full animate-scale-in"
        />
      )}
      <item.icon size={18} />
      <span>{itemLabel}</span>
    </Link>
  )
}

// ── Sidebar Content Component ────────────────────────────────
function SidebarContent({ navProps, navigate, isCollapsed = false, toggleCollapse }) {
  const { t, i18n } = useTranslation()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navRef = useRef(null)
  const [switchingOrgId, setSwitchingOrgId] = useState(null)
  const [orgSwitchError, setOrgSwitchError] = useState('')
  const [quickEntryOpen, setQuickEntryOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)
  const [createWorkspaceError, setCreateWorkspaceError] = useState('')

  const [profileOpen, setProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installInfoOpen, setInstallInfoOpen] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const { data: session } = useSession()
  const { data: activeOrganization } = useActiveOrganization()
  const { data: activeMemberRole } = useActiveMemberRole()
  const { data: organizations } = useListOrganizations()
  const queryClient = useQueryClient()

  const displayName = session?.user?.name || 'User'
  const roleName = typeof activeMemberRole === 'string' ? activeMemberRole : activeMemberRole?.role
  const roleLabel = roleName ? roleName.charAt(0) + roleName.slice(1).toLowerCase() : 'Member'
  const tenantName = activeOrganization?.name || 'Enterprise ERP'
  const email = session?.user?.email || ''
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U'

  const handleLogout = async () => {
    const result = await signOut()
    if (result?.error) return
    await queryClient.cancelQueries()
    queryClient.clear()
    setUserMenuOpen(false)
    navigate('/login', { replace: true })
  }

  // Switch the active workspace: point the session at another org, then hard-reload
  // to re-anchor every query, the SSE channel, and the onboarding gate to the new tenant.
  const handleSwitchOrganization = async (organizationId) => {
    if (switchingOrgId) return
    setSwitchingOrgId(organizationId)
    setOrgSwitchError('')
    try {
      // better-fetch resolves (rather than throws) with { data, error } on a
      // non-OK HTTP response, so a server-side rejection (e.g. 403 not a member)
      // does NOT hit the catch below — check the resolved error explicitly before
      // committing to the clear + hard reload.
      const res = await authClient.organization.setActive({ organizationId })
      if (res?.error) {
        setOrgSwitchError(res.error?.message || 'Could not switch workspace')
        setSwitchingOrgId(null)
        return
      }
      localStorage.setItem('asas.lastActiveOrgId', organizationId)
      queryClient.clear()
      window.location.assign('/dashboard')
    } catch (err) {
      setOrgSwitchError(err?.message || 'Could not switch workspace')
      setSwitchingOrgId(null)
    }
  }

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return
    setIsCreatingWorkspace(true)
    setCreateWorkspaceError('')
    try {
      const name = newWorkspaceName.trim()
      const slug = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace') + '-' + Math.random().toString(36).slice(2, 6)
      const createRes = await authClient.organization.create({
        name,
        slug,
      })
      if (createRes?.error) {
        throw new Error(createRes.error?.message || 'Could not create workspace.')
      }
      const setActiveRes = await authClient.organization.setActive({
        organizationId: createRes.data.id,
      })
      if (setActiveRes?.error) {
        throw new Error(setActiveRes.error?.message || 'Could not activate new workspace.')
      }
      queryClient.clear()
      window.location.assign('/onboarding')
    } catch (err) {
      setCreateWorkspaceError(err?.message || 'Could not create workspace.')
      setIsCreatingWorkspace(false)
    }
  }

  const toggleTheme = () => {
    setUserMenuOpen(false)
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }

  const handleInstallApp = async () => {
    setUserMenuOpen(false)
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
      }
    } else {
      setInstallInfoOpen(true)
    }
  }

  const handleUpdateProfile = async () => {
    setIsUpdatingProfile(true)
    setProfileError('')
    setProfileSuccess('')
    try {
      if (profileName.trim() && profileName.trim() !== displayName) {
        const updateRes = await authClient.updateUser({ name: profileName.trim() })
        if (updateRes?.error) {
          throw new Error(updateRes.error.message || 'Failed to update profile name')
        }
      }
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error('New passwords do not match')
        }
        const policyErr = validatePasswordPolicy(newPassword)
        if (policyErr) {
          throw new Error(policyErr)
        }
        if (!currentPassword) {
          throw new Error('Current password is required to set a new password')
        }
        const pwRes = await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        })
        if (pwRes?.error) {
          throw new Error(pwRes.error.message || 'Failed to change password')
        }
      }
      setProfileSuccess('Profile updated successfully.')
      setTimeout(() => {
        setProfileOpen(false)
        window.location.reload()
      }, 1000)
    } catch (err) {
      setProfileError(err?.message || 'Failed to update profile')
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  // Auto-scroll the active item into view only if it is outside visible area; reset to 0 if all items fit
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    if (nav.scrollHeight <= nav.clientHeight) {
      nav.scrollTop = 0
      return
    }

    const activeEl = nav.querySelector('[data-active="true"]') || nav.querySelector('.bg-surface-active')
    if (!activeEl) {
      nav.scrollTop = 0
      return
    }

    const navRect = nav.getBoundingClientRect()
    const elRect = activeEl.getBoundingClientRect()

    if (elRect.top < navRect.top || elRect.bottom > navRect.bottom) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [navProps.pathname, navProps.openSections])

  const orgList = Array.isArray(organizations) ? organizations : []

  return (
    <div className="flex flex-col h-full min-h-0 relative">

      {/* Brand */}
      <div className={`px-4 py-3.5 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} border-b border-border-subtle flex-shrink-0`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-button bg-primary text-on-primary flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-card transition-micro">
            A
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-heading leading-tight">Asas</p>
                {activeOrganization?.onboardingStatus === 'SAMPLE_LOADED' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                    {t('common.sampleData', 'Sample')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-caption truncate">{tenantName}</p>
            </div>
          )}
        </div>
        {toggleCollapse && (
          <button
            type="button"
            onClick={toggleCollapse}
            className="hidden md:flex text-muted hover:text-heading p-1 rounded hover:bg-surface-muted transition-colors cursor-pointer"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={14} className="rtl:rotate-180" /> : <ChevronLeft size={14} className="rtl:rotate-180" />}
          </button>
        )}
      </div>

      {/* Quick action */}
      <div className="px-3 py-2 flex-shrink-0">
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={() => setQuickEntryOpen(true)}
                className="w-full h-9 flex items-center justify-center p-0 cursor-pointer font-medium"
                aria-label={t('common.newEntry', 'New Entry')}
              >
                <Plus size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t('common.newEntry', 'New Entry')}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            type="button"
            onClick={() => setQuickEntryOpen(true)}
            className="w-full h-9 flex items-center justify-center gap-2 cursor-pointer font-medium"
          >
            <Plus size={14} />
            {t('common.newEntry', 'New Entry')}
          </Button>
        )}
      </div>

      {/* Main navigation - independently scrollable containing all sections */}
      <nav ref={navRef} className="flex-1 min-h-0 px-2 space-y-0.5 overflow-y-auto no-scrollbar scrollbar-soft">
        {NAV.map(item => (
          <NavItem key={item.id} item={item} {...navProps} t={t} isCollapsed={isCollapsed} />
        ))}

        {/* Settings, Support, Help, Data Export moved into scrollable nav */}
        <div className="pt-2 mt-2 border-t border-border-subtle/60 space-y-0.5">
          {BOTTOM_NAV.map(item => (
            <NavItem key={item.id} item={item} {...navProps} t={t} isCollapsed={isCollapsed} />
          ))}
        </div>
      </nav>

      {/* User profile - ONLY element pinned to bottom */}
      <div className="px-3 py-2.5 border-t border-border-subtle flex-shrink-0 relative mt-auto">
        <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="user-menu-button"
              aria-label="User profile menu"
              aria-expanded={userMenuOpen}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'} hover:bg-surface-muted p-2 -mx-2 rounded-lg transition-colors text-left rtl:text-right cursor-pointer`}
            >
              <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-bold text-body flex-shrink-0">
                {initials}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-heading truncate">{displayName}</p>
                  <p className="text-[11px] font-medium text-caption truncate">{roleLabel}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-72 p-0 glass-strong border border-border-default/60 rounded-xl shadow-glass z-50 overflow-hidden animate-scale-in"
          >
            {/* 1. Identity Header */}
            <div className="p-4 flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-surface-strong flex items-center justify-center text-lg font-bold text-body shadow-inner">
                  {initials}
                </div>
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-success rounded-full border-2 border-surface-raised shadow-sm" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-heading truncate leading-tight">{displayName}</p>
                <p className="text-sm text-muted truncate mt-0.5">{email}</p>
              </div>
            </div>

            <DropdownMenuSeparator className="my-0" />

            {/* 2. Workspace Switcher */}
            <div className="p-2 space-y-1">
              {orgList.length > 1 ? (
                <>
                  {orgList.map(org => {
                    const isActive = org.id === activeOrganization?.id
                    return (
                      <DropdownMenuItem
                        key={org.id}
                        disabled={Boolean(switchingOrgId)}
                        onClick={isActive ? undefined : () => handleSwitchOrganization(org.id)}
                        className={`px-3 py-2 flex items-center justify-between rounded-input transition-colors cursor-pointer ${
                          isActive ? 'font-semibold text-heading' : 'font-medium text-heading hover:bg-surface-muted'
                        }`}
                      >
                        <span className="text-sm truncate">{org.name}</span>
                        {isActive && <Check size={16} className="text-accent shrink-0" />}
                      </DropdownMenuItem>
                    )
                  })}
                  {orgSwitchError && (
                    <p className="px-3 py-1.5 text-xs text-danger">{orgSwitchError}</p>
                  )}
                </>
              ) : (
                <DropdownMenuItem
                  onClick={() => navigate('/dashboard/settings')}
                  className="px-3 py-2 flex items-center justify-between hover:bg-surface-muted rounded-input cursor-pointer transition-colors"
                >
                  <span className="text-sm font-semibold text-heading truncate">{tenantName}</span>
                  <Check size={16} className="text-accent shrink-0" />
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  setNewWorkspaceName('')
                  setCreateWorkspaceError('')
                  setCreateWorkspaceOpen(true)
                }}
                className="w-full px-3 py-2 flex items-center gap-3 text-sm font-semibold text-accent hover:bg-surface-muted rounded-input cursor-pointer transition-colors"
              >
                <Plus size={16} />
                {t('common.createWorkspace', 'Create New Workspace')}
              </DropdownMenuItem>
              {orgList.length > 1 && (
                <DropdownMenuItem
                  onClick={() => navigate('/choose-workspace')}
                  className="w-full px-3 py-1.5 flex items-center gap-2.5 text-xs text-muted hover:text-heading hover:bg-surface-muted rounded-input cursor-pointer transition-colors"
                >
                  <Building2 size={14} />
                  <span>Switch or View All Workspaces</span>
                </DropdownMenuItem>
              )}
            </div>

            <DropdownMenuSeparator className="my-0" />

            {/* 3. Account Actions */}
            <div className="p-2 flex flex-col gap-1">
              <DropdownMenuItem
                onClick={() => {
                  setProfileName(displayName)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  setProfileError('')
                  setProfileSuccess('')
                  setProfileOpen(true)
                }}
                className="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-input text-heading text-sm font-medium transition-colors cursor-pointer"
              >
                <User size={16} className="text-caption" />
                {t('common.profilePreferences', 'Profile & Preferences')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={toggleTheme}
                className="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-input text-heading text-sm font-medium transition-colors cursor-pointer"
              >
                <Moon size={16} className="text-caption" />
                {t('common.toggleTheme', 'Toggle Theme')}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="language-toggle"
                onClick={() => changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
                className="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-input text-heading text-sm font-medium transition-colors cursor-pointer"
                title={i18n.language === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
              >
                <Globe size={16} className="text-caption" />
                <span>{i18n.language === 'ar' ? 'English' : 'العربية'}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleInstallApp}
                className="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted rounded-input text-heading text-sm font-medium transition-colors cursor-pointer"
              >
                <Download size={16} className="text-caption" />
                {t('common.downloadApp', 'Download Desktop App')}
              </DropdownMenuItem>
            </div>

            <DropdownMenuSeparator className="my-0" />

            {/* 4. Destructive Action */}
            <div className="p-2">
              <DropdownMenuItem
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 text-danger hover:bg-danger-light hover:text-danger-hover rounded-input text-sm font-bold transition-colors cursor-pointer"
              >
                <LogOut size={16} />
                {t('common.logout', 'Log Out')}
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={quickEntryOpen} onOpenChange={setQuickEntryOpen}>
        <DialogContent className="w-full max-w-lg p-0 glass-strong border border-border-default/60 rounded-card-sm shadow-glass overflow-hidden animate-scale-in">
          <div className="flex items-center justify-between p-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Plus size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-heading">Quick Entry</h3>
                <p className="text-xs text-caption">Select a record type to create or manage</p>
              </div>
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3 stagger-children">
            <button
              type="button"
              onClick={() => { setQuickEntryOpen(false); navigate('/dashboard/hr/employees?new=1'); }}
              className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent hover-lift text-left group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <Users size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-heading">New Employee</h4>
                <p className="text-xs text-caption">Add team member to HR directory</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setQuickEntryOpen(false); navigate('/dashboard/finance/accounts-payable?new=1'); }}
              className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent hover-lift text-left group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <CreditCard size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-heading">New Payable Bill</h4>
                <p className="text-xs text-caption">Record a vendor invoice or bill</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setQuickEntryOpen(false); navigate('/dashboard/finance/expenses?new=1'); }}
              className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent hover-lift text-left group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <CreditCard size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-heading">New Expense</h4>
                <p className="text-xs text-caption">Submit or log an expense receipt</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setQuickEntryOpen(false); navigate('/dashboard/crm/deals?new=1'); }}
              className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent hover-lift text-left group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <Briefcase size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-heading">New CRM Deal</h4>
                <p className="text-xs text-caption">Add sales opportunity to pipeline</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setQuickEntryOpen(false); navigate('/dashboard/inventory?new=1'); }}
              className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent hover-lift text-left group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <Package size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-heading">New Product</h4>
                <p className="text-xs text-caption">Create product in catalog</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setQuickEntryOpen(false); navigate('/dashboard/projects/sprints?new=1'); }}
              className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent hover-lift text-left group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                <FolderKanban size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-heading">Sprints & Tasks</h4>
                <p className="text-xs text-caption">View or create project issues</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create New Workspace Dialog ── */}
      <FormDialog
        open={createWorkspaceOpen}
        onClose={() => !isCreatingWorkspace && setCreateWorkspaceOpen(false)}
        title="Create New Workspace"
        subtitle="Set up a new workspace for your organization or team."
        confirmLabel="Create & Continue"
        busy={isCreatingWorkspace}
        error={createWorkspaceError}
        onConfirm={handleCreateWorkspace}
        width="max-w-md"
      >
        <div>
          <label className="block text-xs font-bold text-heading mb-1.5">Workspace Name</label>
          <Input
            type="text"
            required
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder="e.g. Acme Corporation"
          />
        </div>
      </FormDialog>

      {/* ── Profile & Preferences Dialog ── */}
      <FormDialog
        open={profileOpen}
        onClose={() => !isUpdatingProfile && setProfileOpen(false)}
        title="Profile & Preferences"
        subtitle="Manage your personal details and security credentials."
        confirmLabel="Save Changes"
        busy={isUpdatingProfile}
        error={profileError}
        onConfirm={handleUpdateProfile}
        width="max-w-md"
      >
        <div className="space-y-4">
          {profileSuccess && (
            <div className="p-3 rounded-card-sm bg-success-light border border-success-border text-xs font-semibold text-success-text">
              {profileSuccess}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Email Address</label>
            <Input
              type="email"
              disabled
              value={session?.user?.email || ''}
              className="cursor-not-allowed bg-surface-muted text-muted"
            />
            <p className="text-[11px] text-caption mt-1">Primary account email cannot be modified directly.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Display Name</label>
            <Input
              type="text"
              required
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="pt-3 border-t border-border-subtle">
            <h4 className="text-xs font-bold uppercase tracking-wider text-caption mb-3">Change Password (Optional)</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-heading mb-1">Current Password</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Required to set new password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-heading mb-1">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-heading mb-1">Confirm New Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                />
              </div>
            </div>
          </div>
        </div>
      </FormDialog>

      {/* ── Desktop App Installation Info Dialog ── */}
      <FormDialog
        open={installInfoOpen}
        onClose={() => setInstallInfoOpen(false)}
        title="Download Desktop App"
        subtitle="Install Asas ERP as a Progressive Web Application (PWA) for desktop."
        confirmLabel="Got It"
        onConfirm={() => setInstallInfoOpen(false)}
        width="max-w-md"
      >
        <div className="space-y-3 text-sm text-body">
          <p>
            Asas ERP is a Progressive Web Application (PWA) designed to run natively on Windows, macOS, and Linux without needing a separate installer package.
          </p>
          <div className="p-3 rounded-card-sm bg-surface-muted border border-border-subtle space-y-2 text-xs">
            <p className="font-semibold text-heading">To install on your computer:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted">
              <li>In Google Chrome or Microsoft Edge, look for the <strong className="text-heading">Install</strong> icon (⊕ or computer icon) in the right side of the address bar.</li>
              <li>Or click the browser menu (three dots <strong className="text-heading">⋮</strong>) and select <strong className="text-heading">Install Asas</strong>.</li>
              <li>Asas will launch in its own dedicated, distraction-free desktop window with offline caching and taskbar shortcuts.</li>
            </ol>
          </div>
        </div>
      </FormDialog>

    </div>
  )
}

// ── Main Layout ────────────────────────────────────────────
export default function DashboardLayout() {
  const { t } = useTranslation()
  const location  = useLocation()
  const navigate  = useNavigate()
  const pathname  = location.pathname

  const { data: session } = useSession()
  const { data: activeOrganization } = useActiveOrganization()

  const [openSections, setOpenSections]         = useState({})
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const mobileMenuButtonRef = useRef(null)

  // Listen for ⌘K / Ctrl+K to toggle Command Palette
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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

  useEffect(() => {
    if (!mobileSidebarOpen) return
    document.getElementById('mobile-navigation-drawer')
      ?.querySelector('a[href], button:not([disabled]), input:not([disabled])')
      ?.focus()
    const handleKeyDown = event => {
      if (event.key === 'Escape') setMobileSidebarOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      mobileMenuButtonRef.current?.focus()
    }
  }, [mobileSidebarOpen])

  // Onboarding gate: a workspace whose onboarding isn't finished must go to the
  // 3-choice onboarding page, not the dashboard (mirrors the legacy AuthGuard).
  if (activeOrganization && activeOrganization.onboardingStatus === 'PENDING') {
    return <Navigate to="/onboarding" replace />
  }

  const toggleSection = id =>
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))

  // Build breadcrumbs from pathname with translation support
  const segments = pathname.split('/').filter(Boolean)
  const breadcrumbs = segments.map(seg => {
    const i18nKey = BREADCRUMB_I18N[seg]
    return i18nKey ? t(i18nKey, { defaultValue: BREADCRUMB_LABELS[seg] || seg }) : (BREADCRUMB_LABELS[seg] || (seg.charAt(0).toUpperCase() + seg.slice(1)))
  })
  if (pathname === '/dashboard/projects') {
    breadcrumbs.push(t('nav.portfolio', 'Portfolio Overview'))
  }

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const toggleCollapse = () => setSidebarCollapsed(prev => !prev)

  const navProps = { pathname, openSections, toggleSection, onNavigate: () => setMobileSidebarOpen(false), isCollapsed: sidebarCollapsed }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <TooltipProvider delayDuration={150}>
        <aside className={`hidden md:flex ${sidebarCollapsed ? 'w-16 min-w-16' : 'w-55 min-w-55'} h-screen max-h-screen glass-strong border-e border-border-subtle/60 flex-col relative z-30 transition-all duration-300 ease-out`}>
          <SidebarContent navProps={navProps} navigate={navigate} isCollapsed={sidebarCollapsed} toggleCollapse={toggleCollapse} />
        </aside>
      </TooltipProvider>

      {/* ── Mobile sidebar overlay ── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 border-0 p-0 bg-overlay backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Drawer */}
          <aside id="mobile-navigation-drawer" aria-label="Main navigation" className="relative z-10 w-55 h-full max-h-screen glass-strong border-e border-border-subtle/60 flex flex-col animate-slide-in-right">
            <SidebarContent navProps={{ ...navProps, isCollapsed: false }} navigate={navigate} isCollapsed={false} />
          </aside>
        </div>
      )}

      {/* ── Right side: topbar + page content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        {/* Topbar (56px, one row, 12px gaps, nothing wraps) */}
        <header className="glass-strong border-b border-border-subtle/60 px-4 md:px-6 h-14 min-h-[56px] flex items-center justify-between gap-3 min-w-0">

          {/* Left: hamburger (mobile only) + breadcrumb */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              ref={mobileMenuButtonRef}
              type="button"
              className="md:hidden text-muted hover:text-heading flex-shrink-0"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileSidebarOpen}
              aria-controls="mobile-navigation-drawer"
            >
              <Menu size={20} />
            </button>

            {/* Breadcrumb */}
            <Breadcrumb aria-label="Breadcrumb" className="min-w-0 whitespace-nowrap flex-1 text-xs sm:text-sm">
              <BreadcrumbList className="flex-nowrap gap-1 sm:gap-1.5 text-xs sm:text-sm">
                {breadcrumbs.map((crumb, i) => {
                  const isLast = i === breadcrumbs.length - 1
                  const crumbPath = '/' + pathname.split('/').filter(Boolean).slice(0, i + 1).join('/')
                  return (
                    <BreadcrumbItem key={i} className="min-w-0 whitespace-nowrap gap-1 sm:gap-1.5 shrink-0">
                      {i > 0 && (
                        <BreadcrumbSeparator className="text-faint [&>svg]:size-[13px] [&>svg]:flex-shrink-0" />
                      )}
                      {isLast ? (
                        <BreadcrumbPage
                          className="font-semibold whitespace-nowrap text-xs sm:text-sm"
                          title={typeof crumb === 'string' ? crumb : undefined}
                        >
                          {crumb}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild className="whitespace-nowrap text-caption text-xs sm:text-sm">
                          <Link to={crumbPath}>{crumb}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  )
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Spacer: flex: 1 so the left and right groups never touch */}
          <div className="flex-1" />

          {/* Right group: Global search ⌘K (max 320px) + bell + portal */}
          <div className="ml-auto flex items-center justify-end gap-3 shrink-0 flex-nowrap min-w-0">
            <div className="hidden sm:flex items-center gap-3 shrink min-w-0">
              <Button
                variant="outline"
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="justify-between w-60 h-9 px-3 text-xs text-muted bg-surface-muted hover:bg-surface hover:text-muted border-border-default shadow-sm font-normal shrink-0"
                title="Global search (⌘K or Ctrl+K)"
                aria-label="Search or jump to..."
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Search size={14} className="text-caption flex-shrink-0" />
                  <span className="truncate text-body-light">{t('common.searchJump', 'Search or jump to...')}</span>
                </div>
                <Kbd>⌘K</Kbd>
              </Button>
              <NotificationPopover />
            </div>

            <div id="topbar-actions-portal" className="flex min-w-0 items-center justify-end gap-2 flex-shrink-0 empty:hidden border-s border-border-default ps-3" />
          </div>
        </header>

        {/* Page content */}
        <main className="relative flex-1 min-w-0 min-h-0 overflow-x-auto overflow-y-auto flex flex-col">
          {session?.user && !session.user.emailVerified && (
            <div className="bg-warning-light border-b border-warning/20 px-6 py-2 flex items-center justify-between text-xs text-warning-text">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-warning flex-shrink-0" />
                <span>
                  Please confirm your email address (<strong>{session.user.email}</strong>) to complete verification.
                </span>
              </div>
              <Link to="/verify-email" state={{ email: session.user.email }} className="font-medium underline hover:text-heading ml-4 flex-shrink-0">
                View instructions →
              </Link>
            </div>
          )}
          <Outlet />
        </main>

      </div>

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  )
}
