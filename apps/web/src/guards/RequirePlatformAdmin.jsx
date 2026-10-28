import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { platformApi } from '../lib/api/platform'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Alert, AlertDescription } from '../components/ui/alert'

function PlatformDenied() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f5f5f7] px-6 text-center">
      <p className="text-5xl font-bold text-heading">404</p>
      <p className="text-sm text-muted">Page not found</p>
      <Button asChild variant="link" className="text-sm">
        <Link to="/dashboard">Go back to your workspace</Link>
      </Button>
    </div>
  )
}

function PlatformShell({ icon, title, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-6">
      <div className="w-full max-w-md rounded-[26px] border border-white/80 bg-white/70 p-7 text-center shadow-[0_24px_70px_-32px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700">
          {icon}
        </span>
        <h1 className="mt-4 text-lg font-semibold text-heading">{title}</h1>
        {children}
      </div>
    </div>
  )
}

/** The account has no second factor yet, so no code can be accepted until it enrolls. */
function PlatformEnrollmentRequired() {
  return (
    <PlatformShell icon={<ShieldAlert size={22} />} title="Two-factor authentication required">
      <p className="mt-2 text-sm leading-6 text-muted">
        Platform-console access is protected by a second factor. Enable it from your workspace
        settings, then reload this page.
      </p>
      <Button asChild className="mt-5 w-full rounded-xl">
        <Link to="/dashboard/settings">Open workspace security</Link>
      </Button>
      <Button asChild variant="link" className="mt-2 text-xs">
        <Link to="/dashboard">Back to workspace</Link>
      </Button>
    </PlatformShell>
  )
}

/**
 * The account has a second factor, but this session was created without one (Google OAuth,
 * a trusted device, or a session older than the marker). Verify in place instead of forcing
 * the operator to sign out and start over.
 */
function PlatformStepUp() {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState('totp')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const stepUp = useMutation({
    mutationFn: () => platformApi.stepUp({ method, code: code.trim().replace(/\s/g, '') }),
    onSuccess: () => {
      queryClient.setQueryData(['platform', 'me'], previous => (
        previous
          ? { ...previous, twoFactorVerified: true, requiresTwoFactorVerification: false }
          : previous
      ))
      queryClient.invalidateQueries({ queryKey: ['platform'] })
    },
    onError: async err => {
      setError(err?.message || 'That verification code could not be accepted.')
      setCode('')
      // An expired or revoked session should send the operator back to sign in. A wrong
      // code also returns 401, so only reload the guard when it is not a verification error.
      if (err?.statusCode === 401 && err?.details?.code !== 'PLATFORM_2FA_INVALID_CODE') {
        await queryClient.invalidateQueries({ queryKey: ['platform', 'me'] })
      }
    },
  })

  const handleSubmit = event => {
    event.preventDefault()
    setError('')
    if (!code.trim()) {
      setError('Enter a verification code.')
      return
    }
    stepUp.mutate()
  }

  return (
    <PlatformShell icon={<ShieldCheck size={22} />} title="Verify it’s you">
      <p className="mt-2 text-sm leading-6 text-muted">
        Enter the code from your authenticator app to open the platform console. This session
        has not completed a second-factor check yet.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3 text-left">
        <label htmlFor="platform-step-up-code" className="block text-sm font-medium text-body">
          {method === 'totp' ? 'Authenticator code' : 'Recovery code'}
        </label>
        <Input
          id="platform-step-up-code"
          type="text"
          autoFocus
          autoComplete="one-time-code"
          inputMode={method === 'totp' ? 'numeric' : 'text'}
          value={code}
          onChange={event => setCode(event.target.value)}
          placeholder={method === 'totp' ? '123456' : 'Enter a recovery code'}
          className="text-center tracking-[0.35em]"
        />

        {error && (
          <Alert variant="destructive" className="px-3.5 py-2.5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          disabled={stepUp.isPending || !code.trim()}
          className="w-full rounded-xl"
        >
          {stepUp.isPending && <Loader2 size={16} className="animate-spin" />}
          Verify and continue
        </Button>
      </form>

      <Button
        type="button"
        variant="link"
        onClick={() => {
          setMethod(current => (current === 'totp' ? 'backup-code' : 'totp'))
          setCode('')
          setError('')
        }}
        className="mt-2 text-xs"
      >
        {method === 'totp' ? 'Use a recovery code' : 'Use an authenticator code'}
      </Button>
      <Button asChild variant="link" className="mt-1 text-xs">
        <Link to="/dashboard">Back to workspace</Link>
      </Button>
    </PlatformShell>
  )
}

/**
 * Platform-console guard. It checks only the session and platform role, never workspace
 * membership, because the platform owner may not belong to any tenant.
 */
export default function RequirePlatformAdmin() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['platform', 'me'],
    queryFn: platformApi.me,
    retry: false,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] text-sm text-muted">
        Verifying platform access...
      </div>
    )
  }

  if (error?.statusCode === 401) {
    return <Navigate to="/login" replace />
  }

  if (isError || !data) {
    return <PlatformDenied />
  }

  if (data.requiresTwoFactor) {
    return <PlatformEnrollmentRequired />
  }

  if (data.requiresTwoFactorVerification) {
    return <PlatformStepUp />
  }

  return <Outlet />
}
