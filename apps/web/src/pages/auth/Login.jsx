import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, MailCheck, ArrowRight, RefreshCw } from 'lucide-react'
import { authClient, signIn } from '../../lib/authClient'
import FormDialog from '../../components/common/FormDialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Checkbox } from '../../components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'

function authErrorMessage(error) {
  if (!error) return 'Unable to sign in. Please try again.'
  if (typeof error === 'string') return error
  if (error.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(String(error.message ?? error))) {
    return 'Cannot reach the API. Start the backend on port 4000 and try again.'
  }
  const nested = error.error?.message || error.message
  if (nested) return nested
  return 'Unable to sign in. Please try again.'
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm]       = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [unverifiedEmail, setUnverifiedEmail] = useState('')
  const [resendingVerification, setResendingVerification] = useState(false)
  const [resendVerificationNotice, setResendVerificationNotice] = useState('')

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
      const res = await authClient.forgetPassword({
        email: forgotEmail.trim(),
        redirectTo: window.location.origin + '/login',
      })
      if (res?.error) {
        setForgotError(res.error?.message || 'Could not send reset link.')
      } else {
        setForgotSuccess('If an account exists for this email, password reset instructions have been sent.')
      }
    } catch (err) {
      setForgotError(err?.message || 'Could not send reset link.')
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
      const result = await signIn.email({ email: form.email, password: form.password })
      if (result?.error) {
        sessionStorage.removeItem('asas.auth.redirectAfterTwoFactor')
        const msg = authErrorMessage(result.error)
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
      const msg = authErrorMessage(requestError)
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
        setResendVerificationNotice(res.error?.message || 'Unable to resend confirmation email.')
      } else {
        setResendVerificationNotice(`Confirmation email sent to ${targetEmail}. Please check your inbox.`)
      }
    } catch (err) {
      setResendVerificationNotice(err?.message || 'Unable to resend confirmation email.')
    } finally {
      setResendingVerification(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-heading mb-1">Welcome back</h1>
        <p className="text-sm text-muted">Sign in to your Asas workspace</p>
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
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-body mb-1.5">
            Work email
          </label>
          <Input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-body">Password</label>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setForgotEmail(form.email)
                setForgotError('')
                setForgotSuccess('')
                setForgotOpen(true)
              }}
              className="text-xs text-muted hover:text-heading no-underline hover:no-underline font-normal cursor-pointer"
            >
              Forgot password?
            </Button>
          </div>
          <div className="relative">
            <Input
              type={showPass ? 'text' : 'password'}
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              autoComplete="current-password"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPass(p => !p)}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-caption hover:text-body transition-colors cursor-pointer"
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
          </div>
        </div>

        {/* Remember me */}
        <div className="flex items-center gap-2">
          <Checkbox id="remember" />
          <label htmlFor="remember" className="text-sm text-muted cursor-pointer select-none">
            Keep me signed in
          </label>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full h-10 font-semibold cursor-pointer"
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

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-surface-raised px-3 text-xs text-caption">or</span>
        </div>
      </div>

      {/* Register link */}
      <p className="text-center text-sm text-muted">
        Don't have an account?{' '}
        <Link to="/register" className="text-heading font-semibold hover:underline">
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
              <label className="block text-xs font-medium text-body mb-1">Email address</label>
              <Input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@company.com"
                className="bg-surface-raised"
              />
            </div>
          )}
          {forgotError && (
            <p role="alert" className="text-xs text-danger">{forgotError}</p>
          )}
        </div>
      </FormDialog>
    </div>
  )
}
