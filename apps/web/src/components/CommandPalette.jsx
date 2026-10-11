import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  LayoutDashboard,
  Users,
  CreditCard,
  Clock,
  Briefcase,
  TrendingUp,
  FileText,
  DollarSign,
  Receipt,
  Scale,
  Target,
  BarChart2,
  Calendar,
  Package,
  ArrowLeftRight,
  FolderKanban,
  Kanban,
  Map,
  Settings,
  Shield,
  HelpCircle,
  PlusCircle,
  ArrowRight,
} from 'lucide-react'

const COMMAND_ITEMS = [
  // ── Navigation ───────────────────────────────────────────────────────────
  {
    id: 'nav-dashboard',
    title: 'Dashboard Overview',
    subtitle: 'Platform metrics, cash flow and sprint summary',
    category: 'Navigation',
    path: '/dashboard',
    icon: LayoutDashboard,
    keywords: ['home', 'overview', 'kpis', 'summary'],
  },
  {
    id: 'nav-employees',
    title: 'Employee Directory',
    subtitle: 'HR employees, headcount and departments',
    category: 'Navigation',
    path: '/dashboard/hr/employees',
    icon: Users,
    keywords: ['staff', 'people', 'team', 'hr'],
  },
  {
    id: 'nav-payroll',
    title: 'Payroll Runs',
    subtitle: 'Salary runs, compensation and ledger posting',
    category: 'Navigation',
    path: '/dashboard/hr/payroll',
    icon: CreditCard,
    keywords: ['salary', 'wages', 'pay', 'payslips'],
  },
  {
    id: 'nav-attendance',
    title: 'Time & Attendance',
    subtitle: 'Punches, timesheets, overtime and leave requests',
    category: 'Navigation',
    path: '/dashboard/hr/time-attendance',
    icon: Clock,
    keywords: ['clock', 'hours', 'vacation', 'leave', 'timesheet'],
  },
  {
    id: 'nav-recruitment',
    title: 'Recruitment Pipeline',
    subtitle: 'Candidates, interviews and stage progression',
    category: 'Navigation',
    path: '/dashboard/hr/recruitment',
    icon: Briefcase,
    keywords: ['hiring', 'candidates', 'cv', 'jobs'],
  },
  {
    id: 'nav-finance-overview',
    title: 'Finance Overview',
    subtitle: 'Ledger cash flow, runway and expenses',
    category: 'Navigation',
    path: '/dashboard/finance',
    icon: TrendingUp,
    keywords: ['accounting', 'cash', 'money', 'gl'],
  },
  {
    id: 'nav-ap',
    title: 'Accounts Payable',
    subtitle: 'Vendor bills, approvals and settlements',
    category: 'Navigation',
    path: '/dashboard/finance/accounts-payable',
    icon: FileText,
    keywords: ['bills', 'vendors', 'payables', 'invoices'],
  },
  {
    id: 'nav-ar',
    title: 'Accounts Receivable',
    subtitle: 'Customer invoices, collections and aging',
    category: 'Navigation',
    path: '/dashboard/finance/accounts-receivable',
    icon: DollarSign,
    keywords: ['customers', 'invoices', 'receivables', 'aging'],
  },
  {
    id: 'nav-expenses',
    title: 'Expense Reports',
    subtitle: 'Reimbursements, receipts and approvals',
    category: 'Navigation',
    path: '/dashboard/finance/expenses',
    icon: Receipt,
    keywords: ['spend', 'reimbursement', 'receipts'],
  },
  {
    id: 'nav-trial-balance',
    title: 'Trial Balance',
    subtitle: 'General ledger account balances and verification',
    category: 'Navigation',
    path: '/dashboard/finance/trial-balance',
    icon: Scale,
    keywords: ['ledger', 'debit', 'credit', 'balance', 'audit'],
  },
  {
    id: 'nav-crm-overview',
    title: 'CRM Overview',
    subtitle: 'Win rates, quotas and deal conversions',
    category: 'Navigation',
    path: '/dashboard/crm',
    icon: Target,
    keywords: ['sales', 'pipeline', 'deals'],
  },
  {
    id: 'nav-deals',
    title: 'Deals Pipeline',
    subtitle: 'Kanban board of deals, stages and values',
    category: 'Navigation',
    path: '/dashboard/crm/deals',
    icon: BarChart2,
    keywords: ['stages', 'leads', 'proposals', 'opportunities'],
  },
  {
    id: 'nav-forecast',
    title: 'Revenue Forecast',
    subtitle: 'Weighted pipeline, commitments and quarterly goals',
    category: 'Navigation',
    path: '/dashboard/crm/revenue-forecast',
    icon: Calendar,
    keywords: ['forecast', 'projections', 'sales target'],
  },
  {
    id: 'nav-inventory',
    title: 'Product Catalog',
    subtitle: 'SKUs, stock thresholds and inventory valuation',
    category: 'Navigation',
    path: '/dashboard/inventory',
    icon: Package,
    keywords: ['stock', 'items', 'products', 'warehouse'],
  },
  {
    id: 'nav-movements',
    title: 'Stock Movements',
    subtitle: 'Ledger of all stock ins, outs and adjustments',
    category: 'Navigation',
    path: '/dashboard/inventory/movements',
    icon: ArrowLeftRight,
    keywords: ['ledger', 'transfers', 'stock flow', 'inventory movements'],
  },
  {
    id: 'nav-projects',
    title: 'Project Portfolio',
    subtitle: 'Active projects, budget utilization and milestones',
    category: 'Navigation',
    path: '/dashboard/projects',
    icon: FolderKanban,
    keywords: ['portfolio', 'budget', 'projects'],
  },
  {
    id: 'nav-sprints',
    title: 'Active Sprints',
    subtitle: 'Sprint board, burndown and issue tracker',
    category: 'Navigation',
    path: '/dashboard/projects/sprints',
    icon: Kanban,
    keywords: ['scrum', 'agile', 'tasks', 'issues', 'backlog'],
  },
  {
    id: 'nav-roadmap',
    title: 'Project Roadmap',
    subtitle: 'Gantt timeline, phases and work breakdown',
    category: 'Navigation',
    path: '/dashboard/projects/roadmap',
    icon: Map,
    keywords: ['timeline', 'phases', 'milestones', 'gantt'],
  },
  {
    id: 'nav-settings-general',
    title: 'Settings — General',
    subtitle: 'Workspace profile, timezone, currency and danger zone',
    category: 'Navigation',
    path: '/dashboard/settings',
    icon: Settings,
    keywords: ['preferences', 'config', 'workspace'],
  },
  {
    id: 'nav-settings-members',
    title: 'Settings — Members & Roles',
    subtitle: 'Invite colleagues, manage roles and permissions',
    category: 'Navigation',
    path: '/dashboard/settings/members',
    icon: Shield,
    keywords: ['users', 'roles', 'team', 'permissions', 'invite'],
  },
  {
    id: 'nav-settings-billing',
    title: 'Settings — Billing & Plans',
    subtitle: 'Subscription tier, seats and invoice history',
    category: 'Navigation',
    path: '/dashboard/settings/billing',
    icon: CreditCard,
    keywords: ['subscription', 'plan', 'invoices', 'payment'],
  },
  {
    id: 'nav-support',
    title: 'Help Center & Support',
    subtitle: 'Knowledge base and support ticket submission',
    category: 'Navigation',
    path: '/dashboard/support',
    icon: HelpCircle,
    keywords: ['help', 'ticket', 'faq', 'documentation'],
  },

  // ── Quick Entry Actions ──────────────────────────────────────────────────
  {
    id: 'action-new-payable',
    title: 'New Payable Bill',
    subtitle: 'Record an inbound vendor bill for settlement',
    category: 'Quick Actions',
    path: '/dashboard/finance/accounts-payable?new=1',
    icon: PlusCircle,
    keywords: ['create bill', 'add payable', 'new bill', 'vendor invoice'],
  },
  {
    id: 'action-new-receivable',
    title: 'New Customer Invoice',
    subtitle: 'Issue an outbound invoice for collection',
    category: 'Quick Actions',
    path: '/dashboard/finance/accounts-receivable?new=1',
    icon: PlusCircle,
    keywords: ['create invoice', 'add receivable', 'bill client'],
  },
  {
    id: 'action-log-expense',
    title: 'Log Expense',
    subtitle: 'Submit a new operational or travel reimbursement',
    category: 'Quick Actions',
    path: '/dashboard/finance/expenses?new=1',
    icon: PlusCircle,
    keywords: ['new expense', 'submit receipt', 'reimbursement'],
  },
  {
    id: 'action-add-employee',
    title: 'Add New Employee',
    subtitle: 'Onboard a staff member into the directory',
    category: 'Quick Actions',
    path: '/dashboard/hr/employees?new=1',
    icon: PlusCircle,
    keywords: ['new hire', 'onboard', 'hire employee'],
  },
  {
    id: 'action-create-deal',
    title: 'Create Deal',
    subtitle: 'Add a new opportunity to the sales pipeline',
    category: 'Quick Actions',
    path: '/dashboard/crm/deals?new=1',
    icon: PlusCircle,
    keywords: ['new deal', 'lead', 'opportunity'],
  },
  {
    id: 'action-create-task',
    title: 'Create Issue / Task',
    subtitle: 'Add an item to the active sprint backlog',
    category: 'Quick Actions',
    path: '/dashboard/projects/sprints?new=1',
    icon: PlusCircle,
    keywords: ['new task', 'new issue', 'bug', 'story'],
  },
  {
    id: 'action-add-product',
    title: 'Add Product SKU',
    subtitle: 'Register a new catalog item with reorder thresholds',
    category: 'Quick Actions',
    path: '/dashboard/inventory?new=1',
    icon: PlusCircle,
    keywords: ['new product', 'new sku', 'item'],
  },
]

export default function CommandPalette({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMAND_ITEMS
    return COMMAND_ITEMS.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q)
      const matchSubtitle = item.subtitle.toLowerCase().includes(q)
      const matchCategory = item.category.toLowerCase().includes(q)
      const matchKeywords = item.keywords.some((k) => k.toLowerCase().includes(q))
      return matchTitle || matchSubtitle || matchCategory || matchKeywords
    })
  }, [query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const executeItem = (item) => {
    if (!item) return
    navigate(item.path)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredItems[selectedIndex]) {
        executeItem(filteredItems[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Auto-scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  if (!isOpen) return null

  // Group filtered items by category
  const categories = ['Quick Actions', 'Navigation']
  const grouped = categories
    .map((cat) => ({
      category: cat,
      items: filteredItems.filter((item) => item.category === cat),
    }))
    .filter((g) => g.items.length > 0)

  let globalIndexCounter = 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 sm:px-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-overlay backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Palette Container */}
      <div
        className="relative w-full max-w-xl bg-surface-raised border border-border-default rounded-card-sm shadow-2xl overflow-hidden z-10 flex flex-col max-h-[75vh]"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-border-default gap-3 bg-surface">
          <Search size={18} className="text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, page, or search term..."
            className="flex-1 bg-transparent text-sm text-heading placeholder-muted focus:outline-none"
          />
          <kbd
            onClick={onClose}
            className="cursor-pointer text-[10px] font-mono px-2 py-0.5 rounded border border-border-default bg-surface-muted text-caption hover:bg-surface-strong transition-colors"
          >
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 divide-y divide-border-subtle">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-muted">
              <Search size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-heading">No matching commands</p>
              <p className="text-xs text-body-light mt-1">
                Try searching for pages like "payroll", "invoices", or actions like "create deal".
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.category} className="py-2 first:pt-0 last:pb-0">
                <div className="px-3 py-1.5 text-[10px] font-bold text-caption uppercase tracking-wider">
                  {group.category}
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {group.items.map((item) => {
                    const currentIndex = globalIndexCounter++
                    const isSelected = selectedIndex === currentIndex
                    const Icon = item.icon

                    return (
                      <div
                        key={item.id}
                        data-index={currentIndex}
                        onClick={() => executeItem(item)}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        className={`px-3 py-2.5 rounded-card-sm flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-surface-muted text-body'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-1.5 rounded flex items-center justify-center flex-shrink-0 ${
                              isSelected
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface-muted text-muted'
                            }`}
                          >
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-semibold truncate ${
                                isSelected ? 'text-primary' : 'text-heading'
                              }`}
                            >
                              {item.title}
                            </p>
                            <p className="text-xs text-body-light truncate">{item.subtitle}</p>
                          </div>
                        </div>

                        {isSelected && (
                          <ArrowRight size={14} className="text-primary flex-shrink-0 ml-2" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 border-t border-border-subtle bg-surface-muted flex items-center justify-between text-[11px] text-caption">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono bg-surface border border-border-default px-1 py-0.5 rounded mr-1">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span>
              <kbd className="font-mono bg-surface border border-border-default px-1 py-0.5 rounded mr-1">
                ↵
              </kbd>
              Select
            </span>
            <span>
              <kbd className="font-mono bg-surface border border-border-default px-1 py-0.5 rounded mr-1">
                ESC
              </kbd>
              Close
            </span>
          </div>
          <span className="font-medium">
            {filteredItems.length} {filteredItems.length === 1 ? 'command' : 'commands'}
          </span>
        </div>
      </div>
    </div>
  )
}
