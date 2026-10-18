import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { authClient } from '../../lib/authClient'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Checkbox } from '../../components/ui/checkbox'
import { Alert, AlertDescription } from '../../components/ui/alert'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from '../../components/ui/input-otp'

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

      {error && (
        <Alert variant="destructive" className="mb-5 py-2.5 px-3.5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="two-factor-code" className="mb-2 block text-sm font-medium text-body text-center">
            {useBackupCode ? 'Recovery code' : 'Authenticator code'}
          </label>
          {useBackupCode ? (
            <Input
              id="two-factor-code"
              type="text"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Enter a recovery code"
              className="text-center tracking-widest"
            />
          ) : (
            <div className="flex justify-center my-2">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(val) => setCode(val)}
                autoFocus
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          <Checkbox
            id="trust-device"
            checked={trustDevice}
            onCheckedChange={(checked) => setTrustDevice(Boolean(checked))}
          />
          <label htmlFor="trust-device" className="text-sm text-body cursor-pointer select-none">
            Trust this device for 30 days
          </label>
        </div>

        <Button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full h-10 font-semibold cursor-pointer"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          Verify and continue
        </Button>
      </form>

      <div className="mt-5 text-center">
        <Button
          type="button"
          variant="link"
          onClick={() => { setUseBackupCode(value => !value); setCode(''); setError('') }}
          className="text-sm font-medium text-accent hover:underline cursor-pointer"
        >
          {useBackupCode ? 'Use an authenticator code' : 'Use a recovery code'}
        </Button>
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/login" onClick={() => sessionStorage.removeItem(REDIRECT_KEY)} className="font-medium text-heading hover:underline">
          Return to sign in
        </Link>
      </p>
    </div>
  )
}
