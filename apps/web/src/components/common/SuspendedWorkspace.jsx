import { ShieldAlert } from 'lucide-react'
import { signOut } from '../../lib/authClient'
import { Button } from '../ui/button'

export default function SuspendedWorkspace({ name }) {
  async function handleSignOut() {
    await signOut().catch(() => undefined)
    window.location.assign('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-6">
      <div className="w-full max-w-md rounded-[26px] border border-white/80 bg-white/70 p-7 text-center shadow-[0_24px_70px_-32px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-700">
          <ShieldAlert size={22} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-heading">Workspace suspended</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {name ? `${name} is currently suspended.` : 'This workspace is currently suspended.'} Contact your workspace owner or platform support to restore access.
        </p>
        <Button type="button" variant="outline" className="mt-5 w-full rounded-xl" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
