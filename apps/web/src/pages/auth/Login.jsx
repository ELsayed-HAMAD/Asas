import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, MailCheck, ArrowRight, RefreshCw } from 'lucide-react'
import { authClient, signIn } from '../../lib/authClient'
import { authErrorMessage } from '../../lib/authErrorMessage'
import { authApi } from '../../lib/api/auth'
import DevSocialModal from '../../components/auth/DevSocialModal'
import { GoogleIcon } from '../../components/common/BrandIcons'
import FormDialog from '../../components/common/FormDialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Checkbox } from '../../components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm]       = useState({ email: '', password: '' })
  const [rememberMe, setRememberMe] = useState(true)
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [unverifiedEmail, setUnverifiedEmail] = useState('')
  const [resendingVerification, setResendingVerification] = useState(false)
  const [resendVerificationNotice, setResendVerificationNotice] = useState('')
  const [devModalOpen, setDevModalOpen] = useState(false)

  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const [forgotSuccess, setForgotSuccess] = useState('')

  const submitForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address.')
      return
    }
    setForgotLoading(true)
    setForgotError('')
    try {
      const res = await authClient.requestPasswordReset({
        email: forgotEmail.trim(),
        redirectTo: window.location.origin + '/reset-password',
      })
      if (res?.error) {
        setForgotError(authErrorMessage(res.error, 'Could not send reset link.'))
      } else {
        setForgotSuccess('If an account exists for this email, password reset instructions have been sent.')
      }
    } catch (err) {
      setForgotError(authErrorMessage(err, 'Could not send reset link.'))
    } finally {
      setForgotLoading(false)
    }
  }

  const handleChange = e =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setUnverifiedEmail('')
    setResendVerificationNotice('')

    if (!form.email || !form.password) {
      setError('Please fill in all fields.')
      return
    }

    setLoading(true)
    try {
      const redirectTo = location.state?.from?.pathname || '/dashboard'
      sessionStorage.setItem('asas.auth.redirectAfterTwoFactor', redirectTo)
      const result = await signIn.email({ email: form.email, password: form.password, rememberMe })
      if (result?.error) {
        sessionStorage.removeItem('asas.auth.redirectAfterTwoFactor')
        const msg = authErrorMessage(result.error, 'Unable to sign in. Please try again.')
        const isUnverified =
          result.error?.code === 'EMAIL_NOT_VERIFIED' ||
          /email.*not.*verified|not.*verified/i.test(msg) ||
          /email.*not.*verified|not.*verified/i.test(String(result.error?.message || ''))
        if (isUnverified) {
          setUnverifiedEmail(form.email.trim())
        }
        setError(msg)
        return
      }
      if (result?.data?.twoFactorRedirect) return
      sessionStorage.removeItem('asas.auth.redirectAfterTwoFactor')
      navigate(redirectTo, { replace: true })
    } catch (requestError) {
      sessionStorage.removeItem('asas.auth.redirectAfterTwoFactor')
      const msg = authErrorMessage(requestError, 'Unable to sign in. Please try again.')
      if (/email.*not.*verified|not.*verified/i.test(msg)) {
        setUnverifiedEmail(form.email.trim())
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    const targetEmail = unverifiedEmail || form.email.trim()
    if (!targetEmail || resendingVerification) return
    setResendingVerification(true)
    setResendVerificationNotice('')
    try {
      const res = await authClient.sendVerificationEmail({
        email: targetEmail,
        callbackURL: `${window.location.origin}/dashboard`,
      })
      if (res?.error) {
        setResendVerificationNotice(authErrorMessage(res.error, 'Unable to resend confirmation email.'))
      } else {
        setResendVerificationNotice(`Confirmation email sent to ${targetEmail}. Please check your inbox.`)
      }
    } catch (err) {
      setResendVerificationNotice(authErrorMessage(err, 'Unable to resend confirmation email.'))
    } finally {
      setResendingVerification(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    try {
      // Check if the Google OAuth provider is configured on the backend
      const statusRes = await authApi.getProviders().catch(() => null)
      const providers = statusRes?.data || statusRes || {}

      if (providers.google) {
        const redirectTo = location.state?.from?.pathname || '/dashboard'
        const res = await authClient.signIn.social({
          provider: 'google',
          callbackURL: `${window.location.origin}${redirectTo}`,
        })
        if (res?.error) {
          setError(res.error?.message || 'Google sign-in is not configured. Please use your work email.')
        }
      } else if (providers.devAuthAllowed) {
        // Open local development SSO sandbox
        setDevModalOpen(true)
      } else {
        setError('Google single sign-on is not configured for this deployment. Please sign in with your work email below.')
      }
    } catch (socialErr) {
      setError(authErrorMessage(socialErr, 'Google sign-in is currently unavailable in this environment.'))
    }
  }

  return (
    <div className="auth-form-stagger">
      {/* Header */}
      <div className="mb-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-action">Workspace access</p>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink">Welcome back</h1>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">Sign in to continue to your Asas workspace.</p>
      </div>

      {/* Social SSO Button */}
      <div className="mb-4">
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          className="h-10 w-full rounded-full border-black/10 bg-white/65 text-xs font-medium text-ink-body shadow-none transition-colors hover:bg-white"
        >
          <GoogleIcon className="w-4 h-4" />
          <span>Google</span>
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-black/[0.07]" />
        <span className="text-[10px] text-ink-subtle">or continue with work email</span>
        <span className="h-px flex-1 bg-black/[0.07]" />
      </div>

      {/* Error / Unverified Notice */}
      {error && (
        unverifiedEmail ? (
          <Alert variant="destructive" className="mb-5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-danger/10 text-danger flex-shrink-0 mt-0.5">
                <MailCheck size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <AlertTitle className="text-sm font-semibold">Email not verified</AlertTitle>
                <AlertDescription className="text-xs mt-1 leading-relaxed text-danger-text">
                  Your email address has not been confirmed yet. Please verify your account using the confirmation email we sent you before signing in.
                </AlertDescription>

                {resendVerificationNotice && (
                  <p className="mt-2 text-xs font-medium text-body bg-surface-raised p-2 rounded border border-border-default">
                    {resendVerificationNotice}
                  </p>
                )}

                <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                  <Link
                    to={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                    state={{ email: unverifiedEmail }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-button bg-primary text-on-primary hover:bg-primary-hover active:scale-[0.98] transition-all shadow-xs"
                  >
                    <span>Go to verification page</span>
                    <ArrowRight size={13} />
                  </Link>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResendVerification}
                    disabled={resendingVerification}
                    className="h-7 text-xs"
                  >
                    {resendingVerification ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span>Resending...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={12} />
                        <span>Resend email</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </Alert>
        ) : (
          <Alert variant="destructive" className="mb-5 py-2.5 px-3.5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">

        {/* Email */}
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-[11px] font-medium text-ink-body">
            Work email
          </label>
          <Input
            id="login-email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@company.com"
            autoComplete="email"
            className="h-10 rounded-xl border-black/10 bg-white/65 px-3 text-sm text-ink shadow-none placeholder:text-ink-faint focus-visible:bg-white focus-visible:ring-action"
          />
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="text-[11px] font-medium text-ink-body">Password</label>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setForgotEmail(form.email)
                setForgotError('')
                setForgotSuccess('')
                setForgotOpen(true)
              }}
              className="h-auto text-xs font-normal text-ink-muted no-underline hover:text-action hover:no-underline"
            >
              Forgot password?
            </Button>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPass ? 'text' : 'password'}
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-10 rounded-xl border-black/10 bg-white/65 px-3 pr-11 text-sm text-ink shadow-none placeholder:text-ink-faint focus-visible:bg-white focus-visible:ring-action"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPass(p => !p)}
              aria-label={showPass ? 'Hide password' : 'Show password'}
              aria-controls="login-password"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-caption hover:text-body transition-colors cursor-pointer"
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
          </div>
        </div>

        {/* Remember me */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={rememberMe}
            onCheckedChange={checked => setRememberMe(checked === true)}
            className="data-[state=checked]:border-action data-[state=checked]:bg-action"
          />
          <label htmlFor="remember" className="cursor-pointer select-none text-[11px] text-ink-muted">
            Keep me signed in
          </label>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading}
          className="h-10 w-full rounded-full bg-action text-[13px] font-medium text-white shadow-[0_10px_30px_rgba(0,113,227,0.22)] transition-all hover:bg-action-hover hover:shadow-[0_14px_36px_rgba(0,113,227,0.28)]"
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </Button>

      </form>

      {/* Register link */}
      <p className="mt-4 text-center text-xs text-ink-muted">
        Don't have an account?{' '}
        <Link to="/register" className="font-semibold text-action hover:underline">
          Create workspace
        </Link>
      </p>

      <FormDialog
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Reset your password"
        subtitle="We will send you a link to reset your password."
        confirmLabel="Send Reset Link"
        busy={forgotLoading}
        onConfirm={submitForgotPassword}
      >
        <div className="space-y-3">
          {forgotSuccess ? (
            <div className="p-3 bg-success-light border border-success-border rounded-button text-xs text-success-text">
              {forgotSuccess}
            </div>
          ) : (
            <div>
              <label htmlFor="forgot-password-email" className="block text-xs font-medium text-body mb-1">Email address</label>
              <Input
                id="forgot-password-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="bg-surface-raised"
              />
            </div>
          )}
          {forgotError && (
            <p role="alert" className="text-xs text-danger">{forgotError}</p>
          )}
        </div>
      </FormDialog>

      <DevSocialModal
        isOpen={devModalOpen}
        onClose={() => setDevModalOpen(false)}
        onSuccess={(data) => {
          setDevModalOpen(false)
          const target = location.state?.from?.pathname || data.redirectUrl || '/dashboard'
          window.location.assign(target)
        }}
      />
    </div>
  )
}
