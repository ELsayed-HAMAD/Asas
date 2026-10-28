import { Wrench } from 'lucide-react'
import { Button } from '../ui/button'

export default function MaintenanceScreen({ onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-6">
      <div className="w-full max-w-md rounded-[26px] border border-white/80 bg-white/70 p-7 text-center shadow-[0_24px_70px_-32px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1e1b4b] text-white">
          <Wrench size={22} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-heading">Asas is under maintenance</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Workspace access is paused while the platform is updated. Your data is unchanged. Try again in a few minutes.
        </p>
        <Button type="button" className="mt-5 w-full rounded-xl" onClick={onRetry || (() => window.location.reload())}>
          Try again
        </Button>
      </div>
    </div>
  )
}
