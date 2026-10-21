import { Link } from 'react-router-dom'
import MarketingNavbar from './MarketingNavbar'

export default function MarketingPageFrame({ eyebrow, title, description, children }) {
  return (
    <div className="relative min-h-screen bg-surface text-body flex flex-col justify-between selection:bg-primary-light selection:text-primary overflow-hidden">
      {/* Subtle ambient light orb */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-accent/4 rounded-full blur-3xl pointer-events-none -z-10 animate-float" />

      <div>
        {/* Floating Navbar */}
        <div className="pt-4">
          <MarketingNavbar />
        </div>

        <main>
          {/* Header Section */}
          <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-8 sm:pt-16 sm:pb-12 text-center md:text-left animate-fade-in-up">
            {eyebrow && (
              <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-accent">
                {eyebrow}
              </p>
            )}
            <h1 className="max-w-4xl text-3xl sm:text-5xl font-extrabold tracking-tight text-heading">
              {title}
            </h1>
            {description && (
              <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-body-light">
                {description}
              </p>
            )}
          </section>

          {/* Children Content */}
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-20 animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      {/* Enterprise Footer */}
      <footer className="bg-primary text-on-primary border-t border-border-default py-10 px-4 sm:px-6 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 group">
            <div className="w-6 h-6 rounded-card-sm bg-accent text-on-primary flex items-center justify-center font-bold text-xs shadow-card group-hover:scale-105 transition-micro">
              A
            </div>
            <span className="text-sm font-semibold text-on-primary">Asas Enterprise OS</span>
            <span className="text-xs text-primary-subtle ml-2">© {new Date().getFullYear()} All rights reserved.</span>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap items-center gap-5 text-xs">
            <Link to="/solutions" className="text-primary-subtle hover:text-on-primary transition-micro hover:scale-105">Solutions</Link>
            <Link to="/pricing" className="text-primary-subtle hover:text-on-primary transition-micro hover:scale-105">Pricing</Link>
            <Link to="/documentation" className="text-primary-subtle hover:text-on-primary transition-micro hover:scale-105">Documentation</Link>
            <Link to="/status" className="text-primary-subtle hover:text-on-primary transition-micro hover:scale-105">System Status</Link>
            <Link to="/privacy" className="text-primary-subtle hover:text-on-primary transition-micro hover:scale-105">Privacy</Link>
            <Link to="/terms" className="text-primary-subtle hover:text-on-primary transition-micro hover:scale-105">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
