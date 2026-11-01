import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight } from 'lucide-react'
import { AsasLogo } from '../components/common/AsasLogo'
import CookieSettingsButton from '../components/common/CookieSettingsButton'
import LanguageSwitcher from '../components/common/LanguageSwitcher'
import AuthShowcase from '../components/auth/AuthShowcase'

function showcaseVariant(pathname) {
  if (pathname === '/login') return 'signin'
  if (pathname === '/register') return 'signup'
  return 'security'
}

export default function AuthLayout() {
  const { pathname } = useLocation()
  const { t } = useTranslation()

  return (
    <div className="auth-shell auth-deep-blue relative isolate min-h-screen overflow-clip bg-canvas p-3 text-ink selection:bg-action-soft-strong selection:text-selection-ink sm:p-4">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_78%_-10%,rgba(174,210,255,0.5),transparent_52%),radial-gradient(ellipse_at_6%_94%,rgba(221,214,254,0.46),transparent_48%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute left-[-14%] top-[-360px] -z-10 h-[720px] w-[880px] rounded-full bg-auth-glow-blue/25 blur-[150px]" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-[-320px] right-[20%] -z-10 h-[580px] w-[580px] rounded-full bg-auth-glow-violet/35 blur-[130px]" aria-hidden="true" />

      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-[1400px] gap-3 lg:min-h-[calc(100vh-2rem)] lg:grid-cols-[minmax(0,1.14fr)_minmax(0,0.86fr)]">
        <section className="auth-form-panel relative flex min-h-[calc(100vh-1.5rem)] flex-col overflow-clip rounded-[32px] border border-white/80 bg-[linear-gradient(165deg,#ffffff_0%,#fbfbfd_56%,#f6f7fb_100%)] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10),0_2px_8px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.95)] sm:p-5 lg:order-2 lg:min-h-[calc(100vh-2rem)] lg:p-5">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(0,113,227,0.08),transparent_70%)]" aria-hidden="true" />

          <header className="relative z-10 flex items-center justify-between">
            <Link to="/" aria-label="Asas home" className="group flex items-center gap-2.5 rounded-full">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-inverse-ink text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-transform duration-300 group-hover:scale-[1.04]">
                <AsasLogo className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[13px] font-semibold leading-tight tracking-[-0.02em]">Asas</span>
                <span className="mt-0.5 block text-[8px] font-medium uppercase tracking-[0.13em] text-ink-subtle">{t('auth.shell.tagline')}</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <Link to="/" className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-muted transition-colors hover:text-action">
                {t('auth.shell.backHome')}
                <ArrowUpRight size={12} className="rtl:-scale-x-100" />
              </Link>
            </div>
          </header>

          <main className="auth-form-main relative z-10 flex flex-1 items-center justify-center py-2 sm:py-3">
            <div className="w-full max-w-[400px] animate-fade-in-up">
              <Outlet />
            </div>
          </main>

          <footer className="auth-form-footer relative z-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-black/[0.06] pt-4 text-[10px] text-ink-subtle">
            <span>© {new Date().getFullYear()} Asas</span>
            <Link to="/privacy" className="transition-colors hover:text-action">{t('auth.shell.privacy')}</Link>
            <CookieSettingsButton className="transition-colors hover:text-action" />
            <Link to="/terms" className="transition-colors hover:text-action">{t('auth.shell.terms')}</Link>
          </footer>
        </section>

        <AuthShowcase variant={showcaseVariant(pathname)} />
      </div>
    </div>
  )
}
