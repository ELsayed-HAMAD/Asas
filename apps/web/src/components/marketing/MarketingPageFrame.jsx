import { Link } from 'react-router-dom'
import MarketingNavbar from './MarketingNavbar'
import { AsasLogo } from '../common/AsasLogo'
import CookieSettingsButton from '../common/CookieSettingsButton'

export default function MarketingPageFrame({ eyebrow, title, description, children }) {
  return (
    <div className="relative isolate flex min-h-screen flex-col justify-between overflow-clip bg-canvas text-ink selection:bg-info-soft selection:text-action-text-deep">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-70 focus:rounded-full focus:bg-white focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-slate-950 focus:shadow-lg"
      >
        Skip to content
      </a>
      <div className="pointer-events-none absolute left-1/2 top-[-360px] -z-10 h-[680px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(174,210,255,0.34),rgba(221,214,254,0.16)_45%,transparent_72%)] blur-2xl" aria-hidden="true" />

      <div className="relative">
        <MarketingNavbar />
        <div className="h-20" aria-hidden="true" />

        <main id="main-content" tabIndex={-1} className="focus:outline-none">
          <section className="mx-auto max-w-6xl animate-fade-in-up px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-action">{eyebrow}</p>}
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.04] tracking-[-0.05em] text-ink sm:text-6xl">{title}</h1>
            {description && <p className="mt-6 max-w-2xl text-base leading-7 text-ink-muted-soft sm:text-lg sm:leading-8">{description}</p>}
          </section>

          <div className="mx-auto max-w-6xl animate-fade-in px-4 pb-24 sm:px-6 sm:pb-32">{children}</div>
        </main>
      </div>

      <footer className="relative border-t border-black/[0.07] px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-inverse-ink text-white"><AsasLogo className="h-3.5 w-3.5" /></span>
            <span className="text-sm font-semibold">Asas</span>
            <span className="ml-2 text-[11px] text-ink-subtle">© {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-ink-soft">
            <Link to="/solutions" className="transition-colors hover:text-action">Solutions</Link>
            <Link to="/pricing" className="transition-colors hover:text-action">Pricing</Link>
            <Link to="/documentation" className="transition-colors hover:text-action">Documentation</Link>
            <Link to="/privacy" className="transition-colors hover:text-action">Privacy</Link>
            <CookieSettingsButton className="transition-colors hover:text-action" />
            <Link to="/terms" className="transition-colors hover:text-action">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
