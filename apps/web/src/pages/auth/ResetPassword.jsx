import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { authClient } from '../../lib/authClient'
import { authErrorMessage } from '../../lib/authErrorMessage'
import { getSafeAuthCallbackPath } from '../../lib/authRedirect'
import { validatePasswordPolicy, getPasswordStrength } from '../../lib/passwordPolicy'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const queryError = searchParams.get('error')
  const rawReturnTo = searchParams.get('returnTo')
  const safeReturnTo = rawReturnTo
    ? getSafeAuthCallbackPath(rawReturnTo, window.location.origin, '')
    : ''
  // Only invitation returns are honoured here; other entry points still finish at sign-in.
  const invitationReturnTo = safeReturnTo.startsWith('/accept-invitation') ? safeReturnTo : ''
  const completionTarget = invitationReturnTo || '/login'

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const strength = getPasswordStrength(password)

  const rules = [
    { label: t('auth.reset.rules.minLength'), valid: password.length >= 12 },
    { label: t('auth.reset.rules.uppercase'), valid: /[A-Z]/.test(password) },
    { label: t('auth.reset.rules.lowercase'), valid: /[a-z]/.test(password) },
    { label: t('auth.reset.rules.number'), valid: /[0-9]/.test(password) },
    { label: t('auth.reset.rules.symbol'), valid: /[^A-Za-z0-9]/.test(password) },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!token) {
      setError(t('auth.reset.errors.missingToken'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('auth.reset.mismatch'))
      return
    }

    const policyError = validatePasswordPolicy(password, t)
    if (policyError) {
      setError(policyError)
      return
    }

    setLoading(true)
    try {
      const res = await authClient.resetPassword({
        newPassword: password,
        token,
      })

      if (res?.error) {
        throw new Error(authErrorMessage(res.error, t('auth.reset.errors.resetFailed')))
      }

      setSuccess(true)
      setTimeout(() => {
        navigate(completionTarget, { replace: true })
      }, 2500)
    } catch (err) {
      setError(authErrorMessage(err, t('auth.reset.errors.failedReset')))
    } finally {
      setLoading(false)
    }
  }

  // Token missing or invalid error in query
  if (!token || queryError) {
    return (
      <div className="flex flex-col text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={24} />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-heading">{t('auth.reset.invalidTitle')}</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {queryError === 'EXPIRED_TOKEN'
            ? t('auth.reset.invalidExpired')
            : t('auth.reset.invalidUsed')}
        </p>

        <Button asChild className="h-10 w-full">
          <Link to={completionTarget} className="flex items-center justify-center gap-2">
            {invitationReturnTo ? t('auth.reset.returnToInvitation') : t('auth.reset.returnToSignIn')}
            <ArrowRight size={16} className="rtl:-scale-x-100" />
          </Link>
        </Button>
        {invitationReturnTo && (
          <Link to="/login" className="mt-4 text-xs text-muted hover:text-heading">
            {t('auth.reset.returnToSignInInstead')}
          </Link>
        )}
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-light text-success">
          <CheckCircle2 size={24} />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-heading">{t('auth.reset.successTitle')}</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {t('auth.reset.successBodyUpdated')}{' '}
          {invitationReturnTo
            ? t('auth.reset.successBodyInvitation')
            : t('auth.reset.successBodySignIn')}
        </p>
        <Button asChild className="h-10 w-full">
          <Link to={completionTarget} className="flex items-center justify-center gap-2">
            {invitationReturnTo ? t('auth.reset.continueToInvitation') : t('auth.reset.signInNow')}
            <ArrowRight size={16} className="rtl:-scale-x-100" />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="mb-6 text-center">
        <h1 className="mb-1.5 text-2xl font-semibold text-heading">{t('auth.reset.title')}</h1>
        <p className="text-sm text-muted">
          {t('auth.reset.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t('auth.reset.failedTitle')}</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* New Password */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-body" htmlFor="password">
            {t('auth.reset.newPassword')}
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.reset.newPasswordPlaceholder')}
              autoComplete="new-password"
              aria-describedby="password-requirements"
              required
              autoFocus
              dir="ltr"
              className="pe-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-caption transition-colors hover:text-body"
              aria-label={showPassword ? t('auth.reset.hideNewPassword') : t('auth.reset.showNewPassword')}
              aria-controls="password"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Strength Meter */}
          {password && (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-caption">{t('auth.passwordPolicy.strength.label')}</span>
                <span className="font-medium text-body">{t(`auth.passwordPolicy.strength.${strength.key}`)}</span>
              </div>
              <div className="grid h-1.5 grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-full rounded-full transition-colors ${
                      step <= strength.score ? strength.color : 'bg-surface-muted'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-body" htmlFor="confirmPassword">
            {t('auth.reset.confirmPassword')}
          </label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.reset.confirmPasswordPlaceholder')}
              autoComplete="new-password"
              aria-describedby="password-requirements"
              required
              dir="ltr"
              className="pe-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-caption transition-colors hover:text-body"
              aria-label={showConfirmPassword ? t('auth.reset.hideConfirmPassword') : t('auth.reset.showConfirmPassword')}
              aria-controls="confirmPassword"
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="mt-1 text-[11px] text-danger">{t('auth.reset.mismatch')}</p>
          )}
        </div>

        {/* Requirements Checklist */}
        <div className="space-y-1.5 rounded-card-sm border border-border-subtle bg-surface-muted/50 p-3 text-xs">
          <p id="password-requirements" className="mb-1 font-medium text-body">{t('auth.reset.requirementsTitle')}</p>
          {rules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2 text-caption">
              {rule.valid ? (
                <Check size={13} className="shrink-0 text-success" />
              ) : (
                <span className="ms-1 me-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-default" />
              )}
              <span className={rule.valid ? 'font-medium text-body' : ''}>
                {rule.label}
              </span>
            </div>
          ))}
        </div>

        <Button
          type="submit"
          disabled={loading || !password || !confirmPassword || password !== confirmPassword}
          className="mt-2 h-10 w-full cursor-pointer"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : t('auth.reset.submit')}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link to={completionTarget} className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-heading">
          <ArrowLeft size={14} className="rtl:-scale-x-100" />
          {invitationReturnTo ? t('auth.reset.backToInvitation') : t('auth.reset.backToSignIn')}
        </Link>
      </div>
    </div>
  )
}
