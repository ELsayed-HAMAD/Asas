import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  BookOpen,
  ChevronDown,
  Code2,
  DollarSign,
  FileText,
  Menu,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { AsasLogo } from '../common/AsasLogo'
import { useSession } from '../../lib/authClient'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'

const PRODUCT_AREAS = [
  { id: 'finance', label: 'Finance & treasury', detail: 'Receivables, ledger, reconciliation', icon: DollarSign },
  { id: 'hr', label: 'People & payroll', detail: 'Employees, attendance, payroll review', icon: Users },
  { id: 'crm', label: 'Customer workflows', detail: 'Accounts, deals, sales activity', icon: BarChart3 },
  { id: 'engineering', label: 'Projects & delivery', detail: 'Portfolios, tasks, sprints', icon: Code2 },
  { id: 'inventory', label: 'Inventory records', detail: 'Products, quantities, movements', icon: Boxes },
  { id: 'governance', label: 'Workspace administration', detail: 'Members, roles, access controls', icon: ShieldCheck },
]

const RESOURCES = [
  { label: 'Product guide', detail: 'Setup, workflows, and deployment notes', href: '/documentation', icon: BookOpen },
  { label: 'API reference', detail: 'Routes and schemas from your deployment', href: '/documentation#api-reference', icon: FileText },
]

const MENU_PANEL = 'border-white/80 bg-white/85 shadow-[0_24px_70px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl'

function AreaLink({ area, onNavigate, className = '', ...props }) {
  const Icon = area.icon
  return (
    <Link
      to={`/solutions?area=${area.id}`}
      onClick={onNavigate}
      className={`flex items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action ${className}`}
      {...props}
    >
      <span className="mt-0.5 rounded-xl border border-black/[0.05] bg-white/75 p-2 text-action shadow-sm"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{area.label}</span>
        <span className="mt-1 block text-xs leading-5 text-ink-soft">{area.detail}</span>
      </span>
    </Link>
  )
}

function ResourceLink({ resource, onNavigate, ...props }) {
  const Icon = resource.icon
  return (
    <Link
      to={resource.href}
      onClick={onNavigate}
      className="flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
      {...props}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/[0.05] bg-white/75 text-action shadow-sm"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{resource.label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-ink-soft">{resource.detail}</span>
      </span>
    </Link>
  )
}

function DesktopAreaItem({ area }) {
  return (
    <DropdownMenuItem asChild className="h-auto cursor-pointer rounded-2xl p-0 focus:bg-transparent">
      <AreaLink area={area} />
    </DropdownMenuItem>
  )
}

function DesktopResourceItem({ resource, onNavigate }) {
  return (
    <DropdownMenuItem asChild className="h-auto cursor-pointer rounded-2xl p-0 focus:bg-transparent">
      <ResourceLink resource={resource} onNavigate={onNavigate} />
    </DropdownMenuItem>
  )
}

export default function MarketingNavbar() {
  const { data: session } = useSession()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const onHome = location.pathname === '/' && !location.hash
  const onSolutions = location.pathname === '/solutions'
  const onPricing = location.pathname === '/pricing'
  const onDocumentation = location.pathname === '/documentation' || location.pathname === '/status'
  const hasSession = Boolean(session?.user)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname, location.search, location.hash])

  return (
    <header className="fixed inset-x-0 top-4 z-50 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex items-center justify-between rounded-full border border-white/80 bg-white/65 px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl transition-colors sm:px-4">
        <Link to="/" aria-label="Asas home" className="group flex shrink-0 items-center gap-2.5 rounded-full px-1 py-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-inverse-ink text-white shadow-sm transition-transform group-hover:scale-[1.03]">
            <AsasLogo className="h-4.5 w-4.5" />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold leading-tight tracking-[-0.02em] text-ink">Asas</span>
            <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-ink-subtle">Business workspace</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-0.5 lg:flex">
          <Link to="/" aria-current={onHome ? 'page' : undefined} className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors hover:bg-black/[0.04] hover:text-ink ${onHome ? 'bg-action-soft text-action' : 'text-ink-secondary'}`}>Home</Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={`group h-9 rounded-full px-3.5 text-xs shadow-none hover:bg-black/[0.04] ${onSolutions || (location.pathname === '/' && location.hash === '#features') ? 'bg-action-soft font-semibold text-action' : 'text-ink-secondary'}`} aria-label="Browse product areas">
                Product areas
                <ChevronDown className="h-3 w-3 text-ink-subtle transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" sideOffset={20} className={`${MENU_PANEL} w-[540px] rounded-[24px] p-3`}>
              <DropdownMenuLabel className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">Explore Asas</DropdownMenuLabel>
              <div className="grid grid-cols-2 gap-1 py-1">
                {PRODUCT_AREAS.map(area => <DesktopAreaItem key={area.id} area={area} />)}
              </div>
              <DropdownMenuSeparator className="my-2 bg-black/[0.06]" />
              <DropdownMenuItem asChild className="cursor-pointer rounded-2xl px-3 py-3 text-action focus:bg-black/[0.04] focus:text-action">
                <Link to="/#features" className="flex items-center justify-between text-xs font-semibold">
                  Platform overview <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link to="/solutions" aria-current={onSolutions ? 'page' : undefined} className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors hover:bg-black/[0.04] hover:text-ink ${onSolutions ? 'bg-action-soft text-action' : 'text-ink-secondary'}`}>Solutions</Link>
          <Link to="/pricing" aria-current={onPricing ? 'page' : undefined} className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors hover:bg-black/[0.04] hover:text-ink ${onPricing ? 'bg-action-soft text-action' : 'text-ink-secondary'}`}>Pricing</Link>

          <DropdownMenu open={resourcesOpen} onOpenChange={setResourcesOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-current={onDocumentation ? 'page' : undefined} className={`group h-9 rounded-full px-3.5 text-xs shadow-none hover:bg-black/[0.04] ${onDocumentation ? 'bg-action-soft font-semibold text-action' : 'text-ink-secondary'}`}>
                Resources
                <ChevronDown className="h-3 w-3 text-ink-subtle transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={20} className={`${MENU_PANEL} w-[340px] rounded-[24px] p-2.5`}>
              <DropdownMenuLabel className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">Guides &amp; reference</DropdownMenuLabel>
              <div className="grid gap-1 pb-1">
                {RESOURCES.map(resource => <DesktopResourceItem key={resource.href} resource={resource} onNavigate={() => setResourcesOpen(false)} />)}
              </div>
              <DropdownMenuSeparator className="mx-1 my-1.5 bg-black/[0.06]" />
              <DropdownMenuItem asChild className="cursor-pointer rounded-2xl p-0 focus:bg-transparent">
                <Link
                  to="/documentation"
                  onClick={() => setResourcesOpen(false)}
                  className="flex items-center justify-between rounded-2xl px-3 py-2 text-xs font-semibold text-action transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  Open documentation
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {hasSession ? (
            <Button asChild size="sm" className="h-9 rounded-full bg-action px-4 text-xs font-medium text-white shadow-[0_6px_18px_rgba(0,113,227,0.2)] hover:bg-action-hover">
              <Link to="/dashboard" className="flex items-center gap-1.5">Open workspace <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="h-9 rounded-full px-3 text-xs text-ink-secondary shadow-none hover:bg-black/[0.04] hover:text-ink"><Link to="/login">Sign in</Link></Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-action px-4 text-xs font-medium text-white shadow-[0_6px_18px_rgba(0,113,227,0.2)] hover:bg-action-hover">
                <Link to="/register" className="flex items-center gap-1.5">Create workspace <ArrowUpRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </>
          )}
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full border-black/[0.07] bg-white/50 text-ink-secondary shadow-none hover:bg-white lg:hidden" aria-label="Open navigation menu">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(88vw,420px)] overflow-y-auto border-l border-white/80 bg-canvas/90 p-5 pt-12 backdrop-blur-2xl sm:p-6 sm:pt-12">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="flex items-center gap-2.5 text-ink">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-inverse-ink text-white"><AsasLogo className="h-4.5 w-4.5" /></span>
                Asas
              </SheetTitle>
              <SheetDescription className="text-ink-soft">Explore product workflows, guides, and workspace options.</SheetDescription>
            </SheetHeader>

            <div className="space-y-5">
              <div>
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">Product areas</p>
                <nav aria-label="Product areas" className="grid gap-1">
                  {PRODUCT_AREAS.map(area => <AreaLink key={area.id} area={area} onNavigate={() => setMobileOpen(false)} />)}
                  <SheetClose asChild><Link to="/#features" className="flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold text-action hover:bg-black/[0.04]">Platform overview <ArrowRight className="h-4 w-4" /></Link></SheetClose>
                </nav>
              </div>
              <div className="border-t border-black/[0.07] pt-4">
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">Explore</p>
                <nav aria-label="Resources" className="grid gap-1">
                  <SheetClose asChild><Link to="/" aria-current={onHome ? 'page' : undefined} className={`rounded-2xl px-3 py-2.5 text-sm font-medium hover:bg-black/[0.04] ${onHome ? 'bg-action-soft text-action' : 'text-ink-secondary'}`}>Home</Link></SheetClose>
                  <SheetClose asChild><Link to="/solutions" className="rounded-2xl px-3 py-2.5 text-sm font-medium text-ink-secondary hover:bg-black/[0.04]">All solutions</Link></SheetClose>
                  <SheetClose asChild><Link to="/pricing" className="rounded-2xl px-3 py-2.5 text-sm font-medium text-ink-secondary hover:bg-black/[0.04]">Pricing</Link></SheetClose>
                  {RESOURCES.map(resource => <ResourceLink key={resource.href} resource={resource} onNavigate={() => setMobileOpen(false)} />)}
                </nav>
              </div>
              <div className="grid gap-2 border-t border-black/[0.07] pt-4">
                {hasSession ? (
                  <SheetClose asChild><Button asChild className="h-11 rounded-full bg-action text-white hover:bg-action-hover"><Link to="/dashboard">Open workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></SheetClose>
                ) : (
                  <>
                    <SheetClose asChild><Button asChild variant="outline" className="h-11 rounded-full border-black/10 bg-white/60 text-ink shadow-none"><Link to="/login">Sign in</Link></Button></SheetClose>
                    <SheetClose asChild><Button asChild className="h-11 rounded-full bg-action text-white hover:bg-action-hover"><Link to="/register">Create workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></SheetClose>
                  </>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
