import { useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Check } from 'lucide-react'
import { authClient } from '../../lib/authClient'
import { validatePasswordPolicy, getPasswordStrength } from '../../lib/passwordPolicy'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const queryError = searchParams.get('error')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const strength = useMemo(() => getPasswordStrength(password), [password])

  const rules = useMemo(() => [
    { label: 'At least 12 characters', valid: password.length >= 12 },
    { label: 'One uppercase letter (A-Z)', valid: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a-z)', valid: /[a-z]/.test(password) },
    { label: 'One number (0-9)', valid: /[0-9]/.test(password) },
    { label: 'One symbol or special character', valid: /[^A-Za-z0-9]/.test(password) },
  ], [password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Password reset token is missing. Please request a new reset link.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    const policyError = validatePasswordPolicy(password)
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
        throw new Error(res.error.message || 'Unable to reset password. The link may have expired.')
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 2500)
    } catch (err) {
      setError(err?.message || 'Failed to reset password. Please request a new link.')
    } finally {
      setLoading(false)
    }
  }

  // Token missing or invalid error in query
  if (!token || queryError) {
    return (
      <div className="flex flex-col text-center">
        <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-2xl font-semibold text-heading mb-2">Invalid or Expired Link</h1>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          {queryError === 'EXPIRED_TOKEN'
            ? 'This password reset link has expired. For your security, reset links are only valid for a limited time.'
            : 'This password reset link is invalid or has already been used. Please request a new reset link to continue.'}
        </p>

        <Button asChild className="w-full h-10">
          <Link to="/login" className="flex items-center justify-center gap-2">
            Return to Sign In <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex flex-col text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={24} />
        </div>
        <h1 className="text-2xl font-semibold text-heading mb-2">Password Reset Complete</h1>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          Your password has been securely updated. Redirecting you to sign in...
        </p>
        <Button asChild className="w-full h-10">
          <Link to="/login" className="flex items-center justify-center gap-2">
            Sign In Now <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-heading mb-1.5">Reset Your Password</h1>
        <p className="text-sm text-muted">
          Choose a secure new password for your Asas account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Password Reset Failed</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* New Password */}
        <div>
          <label className="block text-sm font-medium text-body mb-1.5" htmlFor="password">
            New Password
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter at least 12 characters"
              required
              autoFocus
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-caption hover:text-body transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Strength Meter */}
          {password && (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-caption">Password strength</span>
                <span className="font-medium text-body">{strength.label}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 h-1.5">
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
          <label className="block text-sm font-medium text-body mb-1.5" htmlFor="confirmPassword">
            Confirm Password
          </label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-caption hover:text-body transition-colors"
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmPassword && password !== confirmPassword && (
            <p className="text-[11px] text-danger mt-1">Passwords do not match.</p>
          )}
        </div>

        {/* Requirements Checklist */}
        <div className="bg-surface-muted/50 border border-border-subtle rounded-card-sm p-3 space-y-1.5 text-xs">
          <p className="font-medium text-body mb-1">Password Requirements:</p>
          {rules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2 text-caption">
              {rule.valid ? (
                <Check size={13} className="text-emerald-600 flex-shrink-0" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-border-default ml-1 mr-0.5 flex-shrink-0" />
              )}
              <span className={rule.valid ? 'text-body font-medium' : ''}>
                {rule.label}
              </span>
            </div>
          ))}
        </div>

        <Button
          type="submit"
          disabled={loading || !password || !confirmPassword || password !== confirmPassword}
          className="w-full h-10 mt-2 cursor-pointer"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Set New Password'}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link to="/login" className="text-sm font-medium text-muted hover:text-heading transition-colors">
          &larr; Back to sign in
        </Link>
      </div>
    </div>
  )
}
