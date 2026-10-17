import { Link } from 'react-router-dom'

const navLinks = [
  { label: 'Features', to: '/#features' },
  { label: 'Solutions', to: '/solutions' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Documentation', to: '/documentation' },
]

export default function MarketingPageFrame({ eyebrow, title, description, children }) {
  return (
    <div className="min-h-screen bg-surface-raised text-body">
      <header className="sticky top-0 z-50 border-b border-border-subtle bg-surface-raised/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-button bg-primary text-xs font-bold text-white">A</span>
            <span className="text-sm font-semibold text-heading">Asas Enterprise</span>
          </Link>
          <div className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle pt-3 text-xs sm:text-sm md:order-2 md:w-auto md:border-0 md:pt-0">
            {navLinks.map(link => <Link key={link.to} to={link.to} className="text-muted transition-colors hover:text-heading">{link.label}</Link>)}
          </div>
          <div className="order-2 ml-auto flex items-center gap-4 md:order-3">
            <Link to="/login" className="text-sm text-muted transition-colors hover:text-heading">Sign in</Link>
            <Link to="/register" className="rounded-button bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover">Get started</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-10 pt-14 md:pb-14 md:pt-20">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
          <h1 className="max-w-4xl text-3xl font-extrabold tracking-tight text-heading md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted md:text-lg">{description}</p>
        </section>
        <div className="mx-auto max-w-6xl px-6 pb-20">{children}</div>
      </main>

      <footer className="border-t border-primary-hover bg-primary px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link to="/" className="text-sm font-medium text-white">Asas Enterprise</Link>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <Link to="/documentation" className="text-body-light transition-colors hover:text-white">Documentation</Link>
            <Link to="/privacy" className="text-body-light transition-colors hover:text-white">Privacy</Link>
            <Link to="/terms" className="text-body-light transition-colors hover:text-white">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
