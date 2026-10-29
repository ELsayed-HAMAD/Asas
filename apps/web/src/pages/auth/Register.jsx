import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react'
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
  const platformConfig = usePlatformPublicConfig()
  const [signingOut, setSigningOut] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [devModalOpen, setDevModalOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const passwordChecks = [
    { label: '12 or more characters', met: form.password.length >= 12 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(form.password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(form.password) },
    { label: 'Number', met: /[0-9]/.test(form.password) },
    { label: 'Symbol', met: /[^A-Za-z0-9]/.test(form.password) },
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-action">Session active</p>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink">Already signed in</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">
            You are currently signed in as <strong className="font-medium text-ink">{session.user.email}</strong>.
          </p>
        </div>

        <div className="mb-5 space-y-2.5">
          <Link
            to="/onboarding"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-action text-[13px] font-medium text-white shadow-[0_10px_30px_rgba(0,113,227,0.22)] transition-all hover:bg-action-hover"
          >
            Continue to Workspace
          </Link>
          <Button
            type="button"
            variant="outline"
            disabled={signingOut}
            onClick={handleSignOut}
            className="h-10 w-full rounded-full border-black/10 bg-white/65 text-[13px] text-ink shadow-none hover:bg-white"
          >
            {signingOut ? <Loader2 size={16} className="animate-spin" /> : 'Sign out to create a new account'}
          </Button>
        </div>
      </div>
    )
  }

  if (platformConfig.data?.signupsEnabled === false) {
    return (
      <div className="auth-form-stagger flex flex-col text-center">
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-action">Signups paused</p>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink">New signups are paused</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">
            The platform is not accepting new workspaces right now. If you already have an account, sign in to continue.
          </p>
        </div>
        <Link
          to="/login"
          className="flex h-10 w-full items-center justify-center rounded-full bg-action text-[13px] font-medium text-white shadow-[0_10px_30px_rgba(0,113,227,0.22)] transition-all hover:bg-action-hover"
        >
          Sign in instead
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const policyErr = validatePasswordPolicy(form.password)
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
        throw new Error(authErrorMessage(signUpResult.error, 'Could not create your account.'))
      }

      navigate('/verify-email', { state: { email, name } })
    } catch (requestError) {
      setError(authErrorMessage(requestError, 'Unable to create your account.'))
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
          setError(res.error?.message || 'Google sign-up is not configured in this environment. Please sign up with your work email below.')
        }
      } else if (providers.devAuthAllowed) {
        // Open local development SSO sandbox
        setDevModalOpen(true)
      } else {
        setError('Google single sign-on is not configured for this deployment. Please register with your work email below.')
      }
    } catch (socialErr) {
      setError(authErrorMessage(socialErr, 'Google sign-up is currently unavailable in this environment.'))
    }
  }

  return (
    <div className="auth-form-stagger auth-register-form flex flex-col">
      {/* Header */}
      <div className="auth-register-intro mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-action">New workspace</p>
          <span className="inline-flex items-center gap-1 rounded-full border border-action/15 bg-action/[0.07] px-2 py-0.5 text-[9px] font-medium text-action-text">
            <Check size={10} />
            About 2 minutes
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink">Create your workspace</h1>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">Set up a secure workspace for your company’s finance, people, and daily operations.</p>
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
        <span className="text-[10px] text-ink-subtle">or register with work email</span>
        <span className="h-px flex-1 bg-black/[0.07]" />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="auth-register-fields space-y-2">
        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription className="flex flex-col gap-1.5">
              <span>{error}</span>
              {/user already exists|already registered/i.test(error) && (
                <div className="text-xs pt-1 flex items-center gap-2">
                  <Link to="/login" className="underline font-semibold hover:text-danger-hover">
                    Sign in instead &rarr;
                  </Link>
                  <span>&bull;</span>
                  <Link
                    to={`/verify-email?email=${encodeURIComponent(form.email.trim())}`}
                    state={{ email: form.email.trim() }}
                    className="underline font-semibold hover:text-danger-hover"
                  >
                    Verify this email &rarr;
                  </Link>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-body" htmlFor="name">
            Full Name
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder="Jane Doe"
            autoComplete="name"
            className="h-10 rounded-xl border-black/10 bg-white/65 px-3 text-sm text-ink shadow-none placeholder:text-ink-faint focus-visible:bg-white focus-visible:ring-action"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-body" htmlFor="email">
            Work Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="name@company.com"
            autoComplete="email"
            className="h-10 rounded-xl border-black/10 bg-white/65 px-3 text-sm text-ink shadow-none placeholder:text-ink-faint focus-visible:bg-white focus-visible:ring-action"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-body" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={handleChange}
              placeholder="Create a strong password"
              autoComplete="new-password"
              aria-describedby="password-policy"
              className="h-10 rounded-xl border-black/10 bg-white/65 px-3 pr-11 text-sm text-ink shadow-none placeholder:text-ink-faint focus-visible:bg-white focus-visible:ring-action"
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(current => !current)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-controls="password"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-caption transition-colors hover:text-body"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
          </div>

          <div id="password-policy" className="mt-2 space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-medium text-ink-muted">Password strength</span>
              <span className={`text-[10px] font-semibold ${form.password ? 'text-ink-body' : 'text-ink-faint'}`}>
                {passwordStrength.label || 'Not started'}
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
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Create Account'}
        </Button>
      </form>

      {/* TOS Disclaimer */}
      <p className="auth-register-legal mt-3 text-center text-[10px] leading-4 text-ink-subtle">
        By creating an account, you agree to our{' '}
        <Link to="/terms" className="underline hover:text-action">Terms of Service</Link> and{' '}
        <Link to="/privacy" className="underline hover:text-action">Privacy Policy</Link>.
      </p>

      {/* Footer Link */}
      <p className="auth-register-switch mt-3 text-center text-xs text-ink-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-action hover:underline">
          Sign in
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
