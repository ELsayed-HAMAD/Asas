import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { ArrowRight, Check, Eye, EyeOff, Loader2 } from 'lucide-react'
import { signUp, useSession, signOut, authClient } from '../../lib/authClient'
import { usePlatformPublicConfig } from '../../lib/platformConfig'
import { authErrorMessage } from '../../lib/authErrorMessage'
import { authApi } from '../../lib/api/auth'
import DevSocialModal from '../../components/auth/DevSocialModal'
import { GoogleIcon } from '../../components/common/BrandIcons'
import { getPasswordStrength, validatePasswordPolicy } from '../../lib/passwordPolicy'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Alert, AlertDescription } from '../../components/ui/alert'

export default function Register() {
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { t } = useTranslation()
  const platformConfig = usePlatformPublicConfig()
  const [signingOut, setSigningOut] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [devModalOpen, setDevModalOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const passwordChecks = [
    { label: t('auth.passwordPolicy.checks.minLength'), met: form.password.length >= 12 },
    { label: t('auth.passwordPolicy.checks.uppercase'), met: /[A-Z]/.test(form.password) },
    { label: t('auth.passwordPolicy.checks.lowercase'), met: /[a-z]/.test(form.password) },
    { label: t('auth.passwordPolicy.checks.number'), met: /[0-9]/.test(form.password) },
    { label: t('auth.passwordPolicy.checks.symbol'), met: /[^A-Za-z0-9]/.test(form.password) },
  ]
  const passwordStrength = getPasswordStrength(form.password)

  const handleChange = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }))

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  if (session?.user) {
    return (
      <div className="auth-form-stagger flex flex-col text-center">
        <div className="mb-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-action">{t('auth.registerPage.sessionActive')}</p>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{t('auth.registerPage.alreadySignedIn')}</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">
            {t('auth.registerPage.signedInAs', { email: session.user.email })}
          </p>
        </div>

        <div className="mb-5 space-y-2.5">
          <Link
            to="/onboarding"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-action text-[13px] font-medium text-white shadow-[0_10px_30px_rgba(0,113,227,0.22)] transition-all hover:bg-action-hover"
          >
            {t('auth.registerPage.continueToWorkspace')}
          </Link>
          <Button
            type="button"
            variant="outline"
            disabled={signingOut}
            onClick={handleSignOut}
            className="h-10 w-full rounded-full border-black/10 bg-white/65 text-[13px] text-ink shadow-none hover:bg-white"
          >
            {signingOut ? <Loader2 size={16} className="animate-spin" /> : t('auth.registerPage.signOutToCreate')}
          </Button>
        </div>
      </div>
    )
  }

  if (platformConfig.data?.signupsEnabled === false) {
    return (
      <div className="auth-form-stagger flex flex-col text-center">
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-action">{t('auth.registerPage.signupsPaused')}</p>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{t('auth.registerPage.signupsPausedTitle')}</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">
            {t('auth.registerPage.signupsPausedBody')}
          </p>
        </div>
        <Link
          to="/login"
          className="flex h-10 w-full items-center justify-center rounded-full bg-action text-[13px] font-medium text-white shadow-[0_10px_30px_rgba(0,113,227,0.22)] transition-all hover:bg-action-hover"
        >
          {t('auth.registerPage.signInInstead')}
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const policyErr = validatePasswordPolicy(form.password, t)
    if (policyErr) {
      setError(policyErr)
      return
    }

    setIsLoading(true)
    try {
      const name = form.name.trim()
      const email = form.email.trim()
      const signUpResult = await signUp.email({
        email,
        password: form.password,
        name: name || undefined,
        callbackURL: `${window.location.origin}/onboarding`,
      })
      if (signUpResult?.error) {
        throw new Error(authErrorMessage(signUpResult.error, t('auth.registerPage.errors.couldNotCreate')))
      }

      navigate('/verify-email', { state: { email, name } })
    } catch (requestError) {
      setError(authErrorMessage(requestError, t('auth.registerPage.errors.unableToCreate')))
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    setError('')
    try {
      // Check if the Google OAuth provider is configured on the backend
      const statusRes = await authApi.getProviders().catch(() => null)
      const providers = statusRes?.data || statusRes || {}

      if (providers.google) {
        const res = await authClient.signIn.social({
          provider: 'google',
          callbackURL: `${window.location.origin}/onboarding`,
        })
        if (res?.error) {
          setError(res.error?.message || t('auth.registerPage.errors.googleNotConfigured'))
        }
      } else if (providers.devAuthAllowed) {
        // Open local development SSO sandbox
        setDevModalOpen(true)
      } else {
        setError(t('auth.registerPage.errors.googleSsoNotConfigured'))
      }
    } catch (socialErr) {
      setError(authErrorMessage(socialErr, t('auth.registerPage.errors.googleUnavailable')))
    }
  }

  return (
    <div className="auth-form-stagger auth-register-form flex flex-col">
      {/* Header */}
      <div className="auth-register-intro mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-action">{t('auth.registerPage.newWorkspace')}</p>
          <span className="inline-flex items-center gap-1 rounded-full border border-action/15 bg-action/[0.07] px-2 py-0.5 text-[9px] font-medium text-action-text">
            <Check size={10} />
            {t('auth.registerPage.aboutTwoMinutes')}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{t('auth.registerPage.title')}</h1>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{t('auth.registerPage.subtitle')}</p>
      </div>

      {/* Social SSO Button */}
      <div className="auth-register-social mb-4">
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignUp}
          className="h-10 w-full rounded-full border-black/10 bg-white/65 text-xs font-medium text-ink-body shadow-none transition-colors hover:bg-white"
        >
          <GoogleIcon className="w-4 h-4" />
          <span>Google</span>
        </Button>
      </div>

      <div className="auth-register-divider mb-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-black/[0.07]" />
        <span className="text-[10px] text-ink-subtle">{t('auth.registerPage.orEmail')}</span>
        <span className="h-px flex-1 bg-black/[0.07]" />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="auth-register-fields space-y-2">
        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription className="flex flex-col gap-1.5">
              <span>{error}</span>
              {/user already exists|already registered/i.test(error) && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <Link to="/login" className="inline-flex items-center gap-1 font-semibold underline hover:text-danger-hover">
                    {t('auth.registerPage.signInInstead')}
                    <ArrowRight size={11} className="rtl:-scale-x-100" />
                  </Link>
                  <span>&bull;</span>
                  <Link
                    to={`/verify-email?email=${encodeURIComponent(form.email.trim())}`}
                    state={{ email: form.email.trim() }}
                    className="inline-flex items-center gap-1 font-semibold underline hover:text-danger-hover"
                  >
                    {t('auth.registerPage.verifyThisEmail')}
                    <ArrowRight size={11} className="rtl:-scale-x-100" />
                  </Link>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-body" htmlFor="name">
            {t('auth.registerPage.fullName')}
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder={t('auth.registerPage.fullNamePlaceholder')}
            autoComplete="name"
            className="h-10 rounded-xl border-black/10 bg-white/65 px-3 text-sm text-ink shadow-none placeholder:text-ink-faint focus-visible:bg-white focus-visible:ring-action"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-body" htmlFor="email">
            {t('auth.registerPage.workEmail')}
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder={t('auth.registerPage.emailPlaceholder')}
            autoComplete="email"
            dir="ltr"
            className="h-10 rounded-xl border-black/10 bg-white/65 px-3 text-sm text-ink shadow-none placeholder:text-ink-faint focus-visible:bg-white focus-visible:ring-action"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-body" htmlFor="password">
            {t('auth.password')}
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={handleChange}
              placeholder={t('auth.registerPage.passwordPlaceholder')}
              autoComplete="new-password"
              aria-describedby="password-policy"
              dir="ltr"
              className="h-10 rounded-xl border-black/10 bg-white/65 px-3 pe-11 text-sm text-ink shadow-none placeholder:text-ink-faint focus-visible:bg-white focus-visible:ring-action"
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(current => !current)}
              aria-label={showPassword ? t('auth.signIn.hidePassword') : t('auth.signIn.showPassword')}
              aria-controls="password"
              className="absolute end-1 top-1/2 h-7 w-7 -translate-y-1/2 text-caption transition-colors hover:text-body"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
          </div>

          <div id="password-policy" className="mt-2 space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-medium text-ink-muted">{t('auth.passwordPolicy.strength.label')}</span>
              <span className={`text-[10px] font-semibold ${form.password ? 'text-ink-body' : 'text-ink-faint'}`}>
                {form.password
                  ? t(`auth.passwordPolicy.strength.${passwordStrength.key}`)
                  : t('auth.passwordPolicy.strength.notStarted')}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${passwordStrength.color}`}
                style={{ width: `${Math.max(passwordStrength.score, form.password ? 1 : 0) * 25}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {passwordChecks.map(check => (
                <span key={check.label} className={`flex items-center gap-1.5 text-[10px] leading-4 ${check.met ? 'text-action' : 'text-ink-subtle'}`}>
                  <span className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full border ${check.met ? 'border-action bg-action text-white' : 'border-black/10 bg-white/60 text-transparent'}`}>
                    <Check size={7} />
                  </span>
                  {check.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="auth-register-submit mt-4 h-10 w-full rounded-full bg-action text-[13px] font-medium text-white shadow-[0_10px_30px_rgba(0,113,227,0.22)] transition-all hover:bg-action-hover hover:shadow-[0_14px_36px_rgba(0,113,227,0.28)]"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : t('auth.registerPage.createAccount')}
        </Button>
      </form>

      {/* TOS Disclaimer */}
      <p className="auth-register-legal mt-3 text-center text-[10px] leading-4 text-ink-subtle">
        <Trans
          i18nKey="auth.registerPage.legal"
          components={{
            terms: <Link to="/terms" className="underline hover:text-action" />,
            privacy: <Link to="/privacy" className="underline hover:text-action" />,
          }}
        />
      </p>

      {/* Footer Link */}
      <p className="auth-register-switch mt-3 text-center text-xs text-ink-muted">
        {t('auth.registerPage.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-action hover:underline">
          {t('auth.registerPage.signIn')}
        </Link>
      </p>

      <DevSocialModal
        isOpen={devModalOpen}
        onClose={() => setDevModalOpen(false)}
        onSuccess={(data) => {
          setDevModalOpen(false)
          window.location.assign(data.redirectUrl || '/onboarding')
        }}
      />
    </div>
  )
}
