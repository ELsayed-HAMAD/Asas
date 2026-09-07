import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-card-sm bg-primary text-on-primary flex items-center justify-center text-lg font-bold">
            A
          </div>
          <div>
            <p className="text-lg font-semibold text-heading leading-tight">Asas</p>
            <p className="text-xs text-caption">Enterprise ERP</p>
          </div>
        </div>

        {/* Card — Login / Register renders here */}
        <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-8">
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