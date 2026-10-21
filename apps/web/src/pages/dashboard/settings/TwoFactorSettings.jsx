import { useState } from 'react'
import { Loader2, ShieldCheck, ShieldOff, RefreshCw } from 'lucide-react'
import { authClient } from '../../../lib/authClient'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Alert, AlertDescription } from '../../../components/ui/alert'

function getError(result, fallback) {
  return result?.error?.message || fallback
}

function totpSecret(uri) {
  try {
    return new URL(uri).searchParams.get('secret') || ''
  } catch {
    return ''
  }
}

export default function TwoFactorSettings() {
  const query = authClient.useSession()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [enrollment, setEnrollment] = useState(null)
  const [recoveryCodes, setRecoveryCodes] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const enabled = Boolean(query.data?.user?.twoFactorEnabled)

  const startEnrollment = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await authClient.twoFactor.enable({ password, method: 'totp' })
      if (result?.error) {
        setError(getError(result, 'Could not start authenticator setup.'))
        return
      }
      setEnrollment(result?.data ?? null)
      setRecoveryCodes([])
      setCode('')
      setPassword('')
    } catch (requestError) {
      setError(requestError?.message || 'Could not start authenticator setup.')
    } finally {
      setBusy(false)
    }
  }

  const verifyEnrollment = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: code.trim() })
      if (result?.error) {
        setError(getError(result, 'The authenticator code was not accepted.'))
        return
      }
      setRecoveryCodes(enrollment?.backupCodes ?? [])
      setEnrollment(null)
      setCode('')
      setNotice('Two-factor authentication is enabled. Save your recovery codes somewhere safe.')
      await query.refetch?.()
    } catch (requestError) {
      setError(requestError?.message || 'The authenticator code was not accepted.')
    } finally {
      setBusy(false)
    }
  }

  const disableTwoFactor = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await authClient.twoFactor.disable({ password })
      if (result?.error) {
        setError(getError(result, 'Could not disable two-factor authentication.'))
        return
      }
      setPassword('')
      setRecoveryCodes([])
      setNotice('Two-factor authentication has been disabled.')
      await query.refetch?.()
    } catch (requestError) {
      setError(requestError?.message || 'Could not disable two-factor authentication.')
    } finally {
      setBusy(false)
    }
  }

  const regenerateRecoveryCodes = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await authClient.twoFactor.generateBackupCodes({ password })
      if (result?.error) {
        setError(getError(result, 'Could not generate new recovery codes.'))
        return
      }
      setRecoveryCodes(result?.data?.backupCodes ?? [])
      setPassword('')
      setNotice('New recovery codes are ready. Previously generated codes no longer work.')
    } catch (requestError) {
      setError(requestError?.message || 'Could not generate new recovery codes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-5 rounded-card-sm border border-border-default bg-surface-raised p-5 shadow-card" aria-labelledby="two-factor-heading">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-accent-light text-accent">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 id="two-factor-heading" className="text-lg font-bold text-heading">Two-factor authentication</h2>
          <p className="mt-1 text-sm text-muted">Use an authenticator app and one-time codes to protect password sign-ins.</p>
        </div>
      </div>

      <p className="rounded-input border border-border-default bg-surface-muted p-3 text-sm text-body">
        Google and Apple sign-ins use the security controls configured with those identity providers. Asas authenticator verification applies to email and password sign-ins.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert className="border-success-border bg-success-light text-success-text">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {enrollment ? (
        <form onSubmit={verifyEnrollment} className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-heading">Set up your authenticator</h3>
            <p className="text-sm text-body">Add Asas to your authenticator app using this setup key, then enter the app's current six-digit code to verify it.</p>
            <code className="block break-all rounded-input border border-border-default bg-surface-muted p-3 text-sm text-heading">{totpSecret(enrollment.totpURI) || enrollment.totpURI}</code>
            <p className="text-xs text-muted">Keep this key private. It can generate sign-in codes for your account.</p>
          </div>
          <label className="block text-sm font-medium text-body" htmlFor="enrollment-code">Authenticator code</label>
          <Input id="enrollment-code" value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" className="w-full tracking-widest" placeholder="6-digit code" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || code.trim().length < 6}>
              {busy && <Loader2 size={15} className="animate-spin" />} Verify and enable
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { setEnrollment(null); setCode(''); setError('') }}>Cancel setup</Button>
          </div>
        </form>
      ) : (
        <form onSubmit={enabled ? disableTwoFactor : startEnrollment} className="space-y-4">
          <label className="block text-sm font-medium text-body" htmlFor="two-factor-password">Confirm with your password</label>
          <Input id="two-factor-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="w-full" placeholder="Current password" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={enabled ? 'destructive' : 'default'} disabled={busy || !password}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : enabled ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
              {enabled ? 'Disable two-factor' : 'Set up authenticator'}
            </Button>
            {enabled && <Button type="button" variant="outline" disabled={busy || !password} onClick={regenerateRecoveryCodes}><RefreshCw size={14} /> Regenerate recovery codes</Button>}
          </div>
        </form>
      )}

      {recoveryCodes.length > 0 && (
        <div className="space-y-2 rounded-input border border-border-default bg-surface-muted p-4">
          <h3 className="text-sm font-semibold text-heading">Recovery codes</h3>
          <p className="text-xs text-muted">Each code works once. Store them securely; they will not be shown again.</p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-heading">{recoveryCodes.map((recoveryCode, index) => <li key={`${index}-${recoveryCode}`} className="rounded border border-border-default bg-surface-raised px-2 py-1">{recoveryCode}</li>)}</ul>
        </div>
      )}
    </section>
  )
}
