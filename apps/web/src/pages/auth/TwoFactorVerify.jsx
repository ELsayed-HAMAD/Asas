import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [trustDevice, setTrustDevice] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    const normalizedCode = code.trim().replace(/\s/g, '')
    if (!normalizedCode) {
      setError(t('auth.twoFactor.errors.enterCode'))
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code: normalizedCode, trustDevice })
        : await authClient.twoFactor.verifyTotp({ code: normalizedCode, trustDevice })
      if (result?.error) {
        setError(result.error.message || t('auth.twoFactor.errors.invalidCode'))
        return
      }
      const destination = sessionStorage.getItem(REDIRECT_KEY) || '/dashboard'
      sessionStorage.removeItem(REDIRECT_KEY)
      navigate(destination.startsWith('/') && !destination.startsWith('//') ? destination : '/dashboard', { replace: true })
    } catch (verifyError) {
      setError(verifyError?.message || t('auth.twoFactor.errors.invalidCode'))
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
        <h1 className="mb-1 text-2xl font-bold text-heading">{t('auth.twoFactor.title')}</h1>
        <p className="text-sm text-muted">{t('auth.twoFactor.subtitle')}</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-5 px-3.5 py-2.5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="two-factor-code" className="mb-2 block text-center text-sm font-medium text-body">
            {useBackupCode ? t('auth.twoFactor.recoveryCode') : t('auth.twoFactor.authenticatorCode')}
          </label>
          {useBackupCode ? (
            <Input
              id="two-factor-code"
              type="text"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t('auth.twoFactor.recoveryPlaceholder')}
              dir="ltr"
              className="text-center tracking-widest"
            />
          ) : (
            <div className="my-2 flex justify-center" dir="ltr">
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
          <label htmlFor="trust-device" className="cursor-pointer select-none text-sm text-body">
            {t('auth.twoFactor.trustDevice')}
          </label>
        </div>

        <Button
          type="submit"
          disabled={loading || !code.trim()}
          className="h-10 w-full cursor-pointer font-semibold"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {t('auth.twoFactor.verify')}
        </Button>
      </form>

      <div className="mt-5 text-center">
        <Button
          type="button"
          variant="link"
          onClick={() => { setUseBackupCode(value => !value); setCode(''); setError('') }}
          className="cursor-pointer text-sm font-medium text-accent hover:underline"
        >
          {useBackupCode ? t('auth.twoFactor.useAuthenticator') : t('auth.twoFactor.useRecovery')}
        </Button>
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/login" onClick={() => sessionStorage.removeItem(REDIRECT_KEY)} className="font-medium text-heading hover:underline">
          {t('auth.twoFactor.returnToSignIn')}
        </Link>
      </p>
    </div>
  )
}
