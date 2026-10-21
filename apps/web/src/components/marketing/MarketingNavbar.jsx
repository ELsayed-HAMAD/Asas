import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Menu, X, Sparkles } from 'lucide-react'
import { useSession } from '../../lib/authClient'
import { Button } from '../ui/button'

const NAV_ITEMS = [
  { label: 'Features', href: '/#features' },
  { label: 'Solutions', href: '/solutions' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Documentation', href: '/documentation' },
  { label: 'System Status', href: '/status' },
]

export default function MarketingNavbar() {
  const { data: session } = useSession()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-4 z-50 px-4 sm:px-6 w-full max-w-6xl mx-auto">
      <div className="glass-strong border border-border-default/70 rounded-full shadow-glass px-5 sm:px-6 py-2.5 flex items-center justify-between transition-premium hover:border-border-strong/60">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 group transition-micro hover:scale-[1.02] active:scale-[0.98]">
          <div className="w-8 h-8 rounded-button bg-primary group-hover:bg-primary-hover text-on-primary flex items-center justify-center font-bold text-sm shadow-card transition-micro">
            A
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-heading leading-tight">
              Asas
            </span>
            <span className="text-[10px] font-medium text-caption uppercase tracking-wider">
              Enterprise OS
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.href || (item.href === '/#features' && location.pathname === '/' && location.hash === '#features')
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-micro hover:scale-[1.02] active:scale-[0.98] ${
                  isActive
                    ? 'text-accent bg-accent-light font-semibold shadow-xs'
                    : 'text-body hover:text-heading hover:bg-surface-muted/80'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Auth Action Buttons */}
        <div className="hidden sm:flex items-center gap-2.5">
          {session?.user ? (
            <Button asChild size="sm" className="rounded-full bg-primary hover:bg-primary-hover text-on-primary font-medium text-xs px-4 h-8 shadow-card hover-lift transition-micro">
              <Link to="/dashboard" className="flex items-center gap-1.5">
                <span>Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="rounded-full text-xs text-body hover:text-heading hover:bg-surface-muted/70 h-8 px-3 transition-micro active:scale-[0.98]">
                <Link to="/login">Sign In</Link>
              </Button>
              <Button asChild size="sm" className="rounded-full bg-primary hover:bg-primary-hover text-on-primary font-medium text-xs px-4 h-8 shadow-card hover:shadow-glow hover-lift transition-micro active:scale-[0.98]">
                <Link to="/register" className="flex items-center gap-1.5">
                  <span>Start Free</span>
                  <Sparkles className="w-3.5 h-3.5 text-primary-subtle" />
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="md:hidden p-1.5 text-body hover:text-heading rounded-full hover:bg-surface-muted transition-micro"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
          aria-controls="marketing-mobile-navigation"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <nav id="marketing-mobile-navigation" aria-label="Mobile navigation" className="md:hidden mt-2 glass-strong border border-border-default/70 rounded-card p-4 shadow-glass space-y-3 animate-scale-in">
          <div className="flex flex-col space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={location.pathname === item.href || (item.href === '/#features' && location.pathname === '/' && location.hash === '#features') ? 'page' : undefined}
                className={`px-3 py-2 text-sm rounded-button font-medium transition-micro ${
                  location.pathname === item.href || (item.href === '/#features' && location.pathname === '/' && location.hash === '#features')
                    ? 'text-accent bg-accent-light'
                    : 'text-body hover:bg-surface-muted hover:text-heading'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="pt-2 border-t border-border-subtle flex flex-col gap-2">
            {session?.user ? (
              <Button asChild className="w-full rounded-button bg-primary text-on-primary font-medium text-xs h-9 hover-lift transition-micro">
                <Link to="/dashboard" onClick={() => setMobileOpen(false)}>
                  Open Workspace
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" className="w-full rounded-button text-xs h-9 transition-micro">
                  <Link to="/login" onClick={() => setMobileOpen(false)}>
                    Sign In
                  </Link>
                </Button>
                <Button asChild className="w-full rounded-button bg-primary text-on-primary font-medium text-xs h-9 hover-lift transition-micro">
                  <Link to="/register" onClick={() => setMobileOpen(false)}>
                    Start Free Tier
                  </Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
