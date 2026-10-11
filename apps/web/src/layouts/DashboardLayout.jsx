import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, CreditCard, Briefcase,
  Package, FolderKanban, Settings, HelpCircle,
  ChevronDown, ChevronRight, Plus, LogOut, Menu,
  Check, User, Moon, Download, X, Search, Bell
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  authClient, useSession, useActiveOrganization, useActiveMemberRole,
  useListOrganizations, signOut
} from '../lib/authClient'
import FormDialog from '../components/common/FormDialog'
import CommandPalette from '../components/CommandPalette'

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
      { label: 'Trial Balance',         path: '/dashboard/finance/trial-balance' },
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
      { label: 'Revenue Forecast',  path: '/dashboard/crm/revenue-forecast' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    children: [
      { label: 'Product Catalog', path: '/dashboard/inventory' },
      { label: 'Stock Movements', path: '/dashboard/inventory/movements' },
    ],
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
  {
    id: 'exports',
    label: 'Exports',
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
                  <div
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
        <div
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
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)
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

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
        if (newPassword.length < 8) {
          throw new Error('New password must be at least 8 characters')
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

  const orgList = Array.isArray(organizations) ? organizations : []

  return (
    <div className="flex flex-col h-full relative">

      {/* Brand */}
      <div className="px-4 py-4 flex items-center gap-3 border-b border-border-subtle flex-shrink-0">
        <div className="w-8 h-8 rounded-button bg-primary text-on-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
          A
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-heading leading-tight">Asas</p>
            {activeOrganization?.onboardingStatus === 'SAMPLE_LOADED' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                Sample
              </span>
            )}
          </div>
          <p className="text-[11px] text-caption truncate">{tenantName}</p>
        </div>
      </div>

      {/* Quick action */}
      <div className="px-3 py-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => setQuickEntryOpen(true)}
          className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary text-sm font-medium px-3 py-2 rounded-button hover:bg-primary-hover active:scale-[0.98] transition-all cursor-pointer"
        >
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
      <div ref={menuRef} className="px-3 py-3 border-t border-border-subtle flex-shrink-0 relative">
        <AnimatePresence>
          {userMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="absolute bottom-full left-3 mb-2 w-72 bg-surface-raised border border-border-default rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              {/* 1. Identity Header */}
              <div className="p-4 flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-surface-strong flex items-center justify-center text-lg font-bold text-body shadow-inner">
                    {initials}
                  </div>
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-success rounded-full border-2 border-surface-raised shadow-sm"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-heading truncate leading-tight">{displayName}</p>
                  <p className="text-sm text-muted truncate mt-0.5">{email}</p>
                </div>
              </div>

              {/* 2. Workspace Switcher */}
              <div className="border-t border-border-subtle p-2">
                {orgList.length > 1 ? (
                  <>
                    {orgList.map(org => {
                      const isActive = org.id === activeOrganization?.id
                      return (
                        <div
                          key={org.id}
                          role="button"
                          tabIndex={isActive || switchingOrgId ? -1 : 0}
                          onClick={isActive ? undefined : () => handleSwitchOrganization(org.id)}
                          onKeyDown={isActive || switchingOrgId ? undefined : (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handleSwitchOrganization(org.id)
                            }
                          }}
                          aria-disabled={Boolean(switchingOrgId)}
                          className={`px-3 py-2 flex items-center justify-between rounded-input transition-colors ${
                            isActive ? '' : 'hover:bg-surface-muted cursor-pointer'
                          } ${switchingOrgId && !isActive ? 'opacity-60' : ''}`}
                        >
                          <span className={`text-sm truncate ${isActive ? 'font-semibold text-heading' : 'font-medium text-heading'}`}>
                            {org.name}
                          </span>
                          {isActive && <Check size={16} className="text-accent shrink-0" />}
                        </div>
                      )
                    })}
                    {orgSwitchError && (
                      <p className="px-3 py-1.5 text-xs text-danger">{orgSwitchError}</p>
                    )}
                  </>
                ) : (
                  <div
                    onClick={() => {
                      setUserMenuOpen(false)
                      navigate('/dashboard/settings')
                    }}
                    className="px-3 py-2 flex items-center justify-between hover:bg-surface-muted rounded-input cursor-pointer transition-colors"
                  >
                    <span className="text-sm font-semibold text-heading truncate">{tenantName}</span>
                    <Check size={16} className="text-accent shrink-0" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false)
                    setNewWorkspaceName('')
                    setCreateWorkspaceError('')
                    setCreateWorkspaceOpen(true)
                  }}
                  className="w-full px-3 py-2 flex items-center gap-3 text-sm font-semibold text-accent hover:bg-surface-muted rounded-input cursor-pointer transition-colors mt-1 text-left"
                >
                  <Plus size={16} />
                  Create New Workspace
                </button>
              </div>

              {/* 3. Account Actions */}
              <div className="border-t border-border-subtle p-2 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false)
                    setProfileName(displayName)
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                    setProfileError('')
                    setProfileSuccess('')
                    setProfileOpen(true)
                  }}
                  className="flex items-center gap-3 text-left px-3 py-2 hover:bg-surface-muted rounded-input text-heading text-sm font-medium transition-colors cursor-pointer"
                >
                  <User size={16} className="text-caption" />
                  Profile & Preferences
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex items-center gap-3 text-left px-3 py-2 hover:bg-surface-muted rounded-input text-heading text-sm font-medium transition-colors cursor-pointer"
                >
                  <Moon size={16} className="text-caption" />
                  Toggle Theme
                </button>
                <button
                  type="button"
                  onClick={handleInstallApp}
                  className="flex items-center gap-3 text-left px-3 py-2 hover:bg-surface-muted rounded-input text-heading text-sm font-medium transition-colors cursor-pointer"
                >
                  <Download size={16} className="text-caption" />
                  Download Desktop App
                </button>
              </div>

              {/* 4. Destructive Action */}
              <div className="border-t border-border-subtle p-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 text-left px-3 py-2 text-danger hover:bg-danger-light hover:text-danger-hover rounded-input text-sm font-bold transition-colors"
                >
                  <LogOut size={16} />
                  Log Out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="w-full flex items-center gap-2.5 hover:bg-surface-muted p-2 -mx-2 rounded-lg transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-full bg-surface-strong flex items-center justify-center text-xs font-bold text-body flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-heading truncate">{displayName}</p>
            <p className="text-[11px] font-medium text-caption truncate">{roleLabel}</p>
          </div>
        </button>
      </div>

      <AnimatePresence>
        {quickEntryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-lg bg-surface-raised border border-border-default rounded-card-sm shadow-card overflow-hidden"
            >
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
                <button
                  type="button"
                  onClick={() => setQuickEntryOpen(false)}
                  className="p-1 rounded-input text-muted hover:text-heading hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setQuickEntryOpen(false); navigate('/dashboard/hr/employees?new=1'); }}
                  className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent transition-all text-left group cursor-pointer"
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
                  className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent transition-all text-left group cursor-pointer"
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
                  className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent transition-all text-left group cursor-pointer"
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
                  className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent transition-all text-left group cursor-pointer"
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
                  className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent transition-all text-left group cursor-pointer"
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
                  className="flex items-start gap-3 p-3 rounded-card-sm border border-border-subtle bg-surface hover:bg-surface-muted hover:border-accent transition-all text-left group cursor-pointer"
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
          <input
            type="text"
            required
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder="e.g. Acme Corporation"
            className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
            <input
              type="email"
              disabled
              value={session?.user?.email || ''}
              className="w-full border border-border-default rounded-input px-3 py-2 text-sm text-muted bg-surface-muted cursor-not-allowed"
            />
            <p className="text-[11px] text-caption mt-1">Primary account email cannot be modified directly.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-heading mb-1.5">Display Name</label>
            <input
              type="text"
              required
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Your full name"
              className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="pt-3 border-t border-border-subtle">
            <h4 className="text-xs font-bold uppercase tracking-wider text-caption mb-3">Change Password (Optional)</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-heading mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Required to set new password"
                  className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-heading mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-heading mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="w-full border border-border-strong rounded-input px-3 py-2 text-sm text-heading bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
  const location  = useLocation()
  const navigate  = useNavigate()
  const pathname  = location.pathname

  const { data: activeOrganization } = useActiveOrganization()

  const [openSections, setOpenSections]         = useState({})
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

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

  // Onboarding gate: a workspace whose onboarding isn't finished must go to the
  // 3-choice onboarding page, not the dashboard (mirrors the legacy AuthGuard).
  if (activeOrganization && activeOrganization.onboardingStatus === 'PENDING') {
    return <Navigate to="/onboarding" replace />
  }

  const toggleSection = id =>
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))

  // Build breadcrumbs from pathname
  const breadcrumbs = pathname
    .split('/')
    .filter(Boolean)
    .map(seg => BREADCRUMB_LABELS[seg] || (seg.charAt(0).toUpperCase() + seg.slice(1)));

  const navProps = { pathname, openSections, toggleSection, onNavigate: () => setMobileSidebarOpen(false) }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-55 min-w-55 bg-surface-raised border-r border-border-subtle flex-col relative z-30">
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
            <nav className="flex items-center gap-1 text-sm min-w-0" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, i) => {
                const isLast = i === breadcrumbs.length - 1
                const crumbPath = '/' + pathname.split('/').filter(Boolean).slice(0, i + 1).join('/')
                return (
                  <span key={i} className="flex items-center gap-1 min-w-0">
                    {i > 0 && (
                      <ChevronRight size={13} className="text-faint flex-shrink-0" />
                    )}
                    {isLast ? (
                      <span className="truncate font-semibold text-heading" aria-current="page">
                        {crumb}
                      </span>
                    ) : (
                      <Link
                        to={crumbPath}
                        className="truncate text-caption hover:text-heading transition-colors"
                      >
                        {crumb}
                      </Link>
                    )}
                  </span>
                )
              })}
            </nav>
          </div>

          {/* Right: search trigger button + dynamically injected page controls */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-muted bg-surface-muted hover:bg-surface border border-border-default rounded-input transition-colors shadow-sm"
              title="Global search (⌘K or Ctrl+K)"
            >
              <Search size={14} className="text-caption" />
              <span className="hidden md:inline text-body-light">Search or jump to...</span>
              <kbd className="px-1.5 py-0.5 text-[10px] bg-surface-raised border border-border-default rounded text-caption font-mono font-semibold">
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard/settings/notifications')}
              className="p-1.5 text-muted hover:text-heading hover:bg-surface-muted rounded-input transition-colors cursor-pointer"
              title="Notification Settings"
            >
              <Bell size={16} />
            </button>
            <div id="topbar-actions-portal" className="flex items-center gap-2 flex-shrink-0 min-h-[32px]">
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
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
