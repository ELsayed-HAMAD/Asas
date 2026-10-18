import React, { useState, useEffect, useMemo, Fragment } from 'react'
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
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from './ui/command'
import { Kbd } from './ui/kbd'

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

// Deterministic substring matching — cmdk's default filter is fuzzy; the palette
// has always matched with String.includes against title/subtitle/category/keywords.
const substringFilter = (value, search, keywords) => {
  const q = search.toLowerCase()
  if (value.toLowerCase().includes(q)) return 1
  if (keywords?.some((k) => k.toLowerCase().includes(q))) return 1
  return 0
}

export default function CommandPalette({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (isOpen) setQuery('')
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

  const executeItem = (item) => {
    if (!item) return
    navigate(item.path)
    onClose()
  }

  // Group filtered items by category
  const categories = ['Quick Actions', 'Navigation']
  const grouped = categories
    .map((cat) => ({
      category: cat,
      items: filteredItems.filter((item) => item.category === cat),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        hideCloseButton
        className="overflow-hidden p-0 gap-0 max-w-xl max-h-[75vh] border-border-default bg-surface-raised shadow-2xl"
      >
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages and quick actions, then press Enter to navigate.
        </DialogDescription>

        <Command
          filter={substringFilter}
          className="flex-1 min-h-0 flex flex-col [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]]:rounded-card-sm"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Type a command, page, or search term..."
          >
            <Kbd
              onClick={onClose}
              title="Close"
              className="cursor-pointer px-2 rounded bg-surface-muted hover:bg-surface-strong transition-colors"
            >
              ESC
            </Kbd>
          </CommandInput>

          <CommandList className="max-h-[60vh]">
            <CommandEmpty>
              <Search size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-heading">No matching commands</p>
              <p className="text-xs text-body-light mt-1">
                Try searching for pages like "payroll", "invoices", or actions like "create deal".
              </p>
            </CommandEmpty>
            {grouped.map((group, idx) => (
              <Fragment key={group.category}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={group.category}>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <CommandItem
                        key={item.id}
                        value={item.title}
                        keywords={[item.subtitle, group.category, ...item.keywords]}
                        onSelect={() => executeItem(item)}
                        className="group justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-1.5 rounded flex items-center justify-center flex-shrink-0 bg-surface-muted text-muted group-data-[selected=true]:bg-primary group-data-[selected=true]:text-on-primary">
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate text-heading group-data-[selected=true]:text-primary">
                              {item.title}
                            </p>
                            <p className="text-xs text-body-light truncate">{item.subtitle}</p>
                          </div>
                        </div>

                        <ArrowRight size={14} className="text-primary flex-shrink-0 ml-2 hidden group-data-[selected=true]:block" />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>

        {/* Footer info bar */}
        <div className="px-4 py-2 border-t border-border-subtle bg-surface-muted flex items-center justify-between text-[11px] text-caption">
          <div className="flex items-center gap-3">
            <span>
              <Kbd className="bg-surface px-1 py-0.5 rounded mr-1">↑↓</Kbd>
              Navigate
            </span>
            <span>
              <Kbd className="bg-surface px-1 py-0.5 rounded mr-1">↵</Kbd>
              Select
            </span>
            <span>
              <Kbd className="bg-surface px-1 py-0.5 rounded mr-1">ESC</Kbd>
              Close
            </span>
          </div>
          <span className="font-medium">
            {filteredItems.length} {filteredItems.length === 1 ? 'command' : 'commands'}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}