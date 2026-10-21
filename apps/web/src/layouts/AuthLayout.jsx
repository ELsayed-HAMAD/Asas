import { Outlet, Link } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="relative min-h-screen bg-surface flex items-center justify-center p-4 overflow-hidden selection:bg-primary-light selection:text-primary">
      {/* Ambient background glow orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-accent/5 rounded-full blur-3xl pointer-events-none -z-10 animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[250px] bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-md relative z-10 animate-fade-in-up">

        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-3 mb-8 group transition-micro">
          <div className="w-9 h-9 rounded-card-sm bg-primary text-on-primary flex items-center justify-center text-lg font-bold shadow-card group-hover:scale-105 transition-micro">
            A
          </div>
          <div>
            <p className="text-lg font-semibold text-heading leading-tight group-hover:text-accent transition-colors">Asas</p>
            <p className="text-xs text-caption">Enterprise ERP</p>
          </div>
        </Link>

        {/* Card — Login / Register renders here */}
        <div className="glass-strong rounded-card border border-border-default/70 shadow-glass p-8 transition-premium">
          <Outlet />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-caption mt-6">
          © {new Date().getFullYear()} Asas Enterprise ERP. All rights reserved.
        </p>

      </div>
    </div>
  )
}
