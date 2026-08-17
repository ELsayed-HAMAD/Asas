import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center text-base font-bold">
            A
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900 leading-tight">Asas</p>
            <p className="text-xs text-gray-400">Enterprise ERP</p>
          </div>
        </div>

        {/* Card — Login / Register renders here */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <Outlet />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} Asas Enterprise ERP. All rights reserved.
        </p>

      </div>
    </div>
  )
}