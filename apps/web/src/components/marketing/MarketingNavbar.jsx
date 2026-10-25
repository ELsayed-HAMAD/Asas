import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  BookOpen,
  Code2,
  DollarSign,
  FileText,
  Menu,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
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
  { label: 'Deployment status', detail: 'Live readiness fields reported by the API', href: '/status', icon: ShieldCheck },
]

function AreaLink({ area, onNavigate, className = '' }) {
  const Icon = area.icon
  return (
    <Link
      to={`/solutions?area=${area.id}`}
      onClick={onNavigate}
      className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      <span className="mt-0.5 rounded-lg bg-primary-light p-2 text-primary"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-heading">{area.label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{area.detail}</span>
      </span>
    </Link>
  )
}

function ResourceLink({ resource, onNavigate }) {
  const Icon = resource.icon
  return (
    <Link
      to={resource.href}
      onClick={onNavigate}
      className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Icon className="mt-0.5 h-4 w-4 text-accent" />
      <span>
        <span className="block text-sm font-semibold text-heading">{resource.label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{resource.detail}</span>
      </span>
    </Link>
  )
}

function DesktopAreaItem({ area }) {
  const Icon = area.icon
  return (
    <DropdownMenuItem asChild className="h-auto cursor-pointer rounded-xl p-0 focus:bg-transparent">
      <Link to={`/solutions?area=${area.id}`} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-muted focus:bg-surface-muted">
        <span className="mt-0.5 rounded-lg bg-primary-light p-2 text-primary"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-heading">{area.label}</span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">{area.detail}</span>
        </span>
      </Link>
    </DropdownMenuItem>
  )
}

function DesktopResourceItem({ resource, onNavigate }) {
  const Icon = resource.icon
  return (
    <DropdownMenuItem asChild className="h-auto cursor-pointer rounded-xl p-0 focus:bg-transparent">
      <Link to={resource.href} onClick={onNavigate} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-muted focus:bg-surface-muted">
        <Icon className="mt-0.5 h-4 w-4 text-accent" />
        <span>
          <span className="block text-sm font-semibold text-heading">{resource.label}</span>
          <span className="mt-0.5 block text-xs leading-5 text-muted">{resource.detail}</span>
        </span>
      </Link>
    </DropdownMenuItem>
  )
}

export default function MarketingNavbar() {
  const { data: session } = useSession()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const onSolutions = location.pathname === '/solutions'
  const onPricing = location.pathname === '/pricing'
  const onDocumentation = location.pathname === '/documentation' || location.pathname === '/status'
  const hasSession = Boolean(session?.user)

  useEffect(() => {
    setMobileOpen(false)
    setResourcesOpen(false)
  }, [location.pathname, location.search, location.hash])

  return (
    <header className="sticky top-4 z-50 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex items-center justify-between rounded-full border border-border-default/70 bg-surface/80 px-4 py-2.5 shadow-glass backdrop-blur-xl transition-premium hover:border-border-strong/60 sm:px-5">
        <Link to="/" aria-label="Asas home" className="group flex shrink-0 items-center gap-2.5 transition-transform hover:scale-[1.02] active:scale-[0.98]">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-sm font-bold text-on-primary shadow-card transition-colors group-hover:bg-primary-hover">A</span>
          <span className="flex flex-col">
            <span className="text-sm font-bold leading-tight tracking-tight text-heading">Asas</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-caption">Enterprise workspace</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={`h-9 rounded-full px-3.5 text-xs ${onSolutions || (location.pathname === '/' && location.hash === '#features') ? 'bg-accent-light font-semibold text-accent' : 'text-body'}`} aria-label="Browse product areas">
                Product areas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-[380px] rounded-2xl border-border-default/80 bg-surface-raised/95 p-3 shadow-glass backdrop-blur-xl">
              <DropdownMenuLabel className="px-3 pb-2 pt-1">Explore Asas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="grid grid-cols-2 gap-1 py-1">
                {PRODUCT_AREAS.map(area => <DesktopAreaItem key={area.id} area={area} />)}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-3 py-2.5 text-accent focus:text-accent">
                <Link to="/#features" className="flex items-center justify-between font-semibold">
                  Platform overview <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link to="/solutions" aria-current={onSolutions ? 'page' : undefined} className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors hover:bg-surface-muted hover:text-heading ${onSolutions ? 'text-accent' : 'text-body'}`}>Solutions</Link>
          <Link to="/pricing" aria-current={onPricing ? 'page' : undefined} className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors hover:bg-surface-muted hover:text-heading ${onPricing ? 'text-accent' : 'text-body'}`}>Pricing</Link>

          <DropdownMenu open={resourcesOpen} onOpenChange={setResourcesOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-current={onDocumentation ? 'page' : undefined} className={`h-9 rounded-full px-3.5 text-xs ${onDocumentation ? 'bg-accent-light font-semibold text-accent' : 'text-body'}`}>
                Resources
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[320px] rounded-2xl border-border-default/80 bg-surface-raised/95 p-2 shadow-glass backdrop-blur-xl">
              {RESOURCES.map(resource => <DesktopResourceItem key={resource.href} resource={resource} onNavigate={() => setResourcesOpen(false)} />)}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {hasSession ? (
            <Button asChild size="sm" className="h-9 rounded-full bg-primary px-4 text-xs font-semibold text-on-primary shadow-card hover:bg-primary-hover">
              <Link to="/dashboard" className="flex items-center gap-1.5">Open workspace <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="h-9 rounded-full px-3 text-xs text-body hover:text-heading"><Link to="/login">Sign in</Link></Button>
              <Button asChild size="sm" className="h-9 rounded-full bg-primary px-4 text-xs font-semibold text-on-primary shadow-card hover:bg-primary-hover">
                <Link to="/register" className="flex items-center gap-1.5">Create workspace <Sparkles className="h-3.5 w-3.5" /></Link>
              </Button>
            </>
          )}
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full border-border-default/80 text-body lg:hidden" aria-label="Open navigation menu">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(88vw,420px)] overflow-y-auto border-l border-border-default/70 bg-surface/95 p-5 pt-12 backdrop-blur-2xl sm:p-6 sm:pt-12">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-sm font-bold text-on-primary">A</span>
                Asas
              </SheetTitle>
              <SheetDescription>Explore product workflows, guides, and workspace options.</SheetDescription>
            </SheetHeader>

            <div className="space-y-5">
              <div>
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-caption">Product areas</p>
                <nav aria-label="Product areas" className="grid gap-1">
                  {PRODUCT_AREAS.map(area => <AreaLink key={area.id} area={area} onNavigate={() => setMobileOpen(false)} />)}
                  <SheetClose asChild><Link to="/#features" className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-accent hover:bg-surface-muted">Platform overview <ArrowRight className="h-4 w-4" /></Link></SheetClose>
                </nav>
              </div>
              <div className="border-t border-border-subtle pt-4">
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-caption">Explore</p>
                <nav aria-label="Resources" className="grid gap-1">
                  <SheetClose asChild><Link to="/solutions" className="rounded-xl px-3 py-2.5 text-sm font-medium text-body hover:bg-surface-muted">All solutions</Link></SheetClose>
                  <SheetClose asChild><Link to="/pricing" className="rounded-xl px-3 py-2.5 text-sm font-medium text-body hover:bg-surface-muted">Pricing</Link></SheetClose>
                  {RESOURCES.map(resource => <ResourceLink key={resource.href} resource={resource} onNavigate={() => setMobileOpen(false)} />)}
                </nav>
              </div>
              <div className="grid gap-2 border-t border-border-subtle pt-4">
                {hasSession ? (
                  <SheetClose asChild><Button asChild className="h-11 rounded-xl bg-primary text-on-primary"><Link to="/dashboard">Open workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></SheetClose>
                ) : (
                  <>
                    <SheetClose asChild><Button asChild variant="outline" className="h-11 rounded-xl"><Link to="/login">Sign in</Link></Button></SheetClose>
                    <SheetClose asChild><Button asChild className="h-11 rounded-xl bg-primary text-on-primary"><Link to="/register">Create workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></SheetClose>
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
