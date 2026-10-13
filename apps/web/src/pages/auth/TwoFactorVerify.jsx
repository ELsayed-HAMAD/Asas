import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { authClient } from '../../lib/authClient'

const REDIRECT_KEY = 'asas.auth.redirectAfterTwoFactor'

export default function TwoFactorVerify() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [trustDevice, setTrustDevice] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    const normalizedCode = code.trim().replace(/\s/g, '')
    if (!normalizedCode) {
      setError('Enter the code from your authenticator app or a recovery code.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code: normalizedCode, trustDevice })
        : await authClient.twoFactor.verifyTotp({ code: normalizedCode, trustDevice })
      if (result?.error) {
        setError(result.error.message || 'That verification code could not be accepted.')
        return
      }
      const destination = sessionStorage.getItem(REDIRECT_KEY) || '/dashboard'
      sessionStorage.removeItem(REDIRECT_KEY)
      navigate(destination.startsWith('/') && !destination.startsWith('//') ? destination : '/dashboard', { replace: true })
    } catch (verifyError) {
      setError(verifyError?.message || 'That verification code could not be accepted.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent">
          <ShieldCheck size={23} />
        </div>
        <h1 className="mb-1 text-2xl font-bold text-heading">Two-factor verification</h1>
        <p className="text-sm text-muted">Enter a code to finish signing in to Asas.</p>
      </div>

      {error && <div role="alert" className="mb-5 rounded-button border border-danger-border bg-danger-light px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="two-factor-code" className="mb-1.5 block text-sm font-medium text-body">
            {useBackupCode ? 'Recovery code' : 'Authenticator code'}
          </label>
          <input
            id="two-factor-code"
            type="text"
            inputMode={useBackupCode ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={useBackupCode ? 'Enter a recovery code' : '6-digit code'}
            className="w-full rounded-button border border-border-default bg-surface-muted px-3.5 py-2.5 text-sm tracking-widest text-heading focus:border-transparent focus:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} className="accent-primary" />
          Trust this device for 30 days
        </label>

        <button type="submit" disabled={loading || !code.trim()} className="flex w-full items-center justify-center gap-2 rounded-button bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60">
          {loading && <Loader2 size={16} className="animate-spin" />}
          Verify and continue
        </button>
      </form>

      <div className="mt-5 text-center">
        <button type="button" onClick={() => { setUseBackupCode(value => !value); setCode(''); setError('') }} className="text-sm font-medium text-accent hover:underline">
          {useBackupCode ? 'Use an authenticator code' : 'Use a recovery code'}
        </button>
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/login" onClick={() => sessionStorage.removeItem(REDIRECT_KEY)} className="font-medium text-heading hover:underline">Return to sign in</Link>
      </p>
    </div>
  )
}
