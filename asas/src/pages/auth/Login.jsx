import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { authService } from '../../services/auth.service'

export default function Login() {
  const navigate = useNavigate()

  const [form, setForm]       = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleChange = e =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')

    if (!form.email || !form.password) {
      setError('Please fill in all fields.')
      return
    }

    setLoading(true)

    // ── Temporary: simulate login ──────────────────────────
    // Replace this with a real API call later:
    // const res = await authService.login(form.email, form.password)
    // localStorage.setItem('asas_token', res.token)
    try {
      const result = await authService.login(form)
      localStorage.setItem('asas_token', result.token)
      localStorage.setItem('asas_user', JSON.stringify(result.user))
      navigate('/dashboard')
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Unable to sign in. Please try again.')
    }
    // ───────────────────────────────────────────────────────

    setLoading(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-heading mb-1">Welcome back</h1>
        <p className="text-sm text-muted">Sign in to your Asas workspace</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 px-3.5 py-2.5 bg-danger-light border border-danger-border rounded-button text-sm text-danger">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-body mb-1.5">
            Work email
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@company.com"
            autoComplete="email"
            className="w-full px-3.5 py-2.5 text-sm border border-border-default rounded-button bg-surface-muted focus:outline-none focus:ring-2 focus:ring-border-strong focus:bg-surface-raised placeholder:text-caption transition-all"
          />
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-body">Password</label>
            <a href="#" className="text-xs text-muted hover:text-heading transition-colors">
              Forgot password?
            </a>
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 pr-10 text-sm border border-border-default rounded-button bg-surface-muted focus:outline-none focus:ring-2 focus:ring-border-strong focus:bg-surface-raised placeholder:text-caption transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-caption hover:text-body transition-colors"
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Remember me */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="remember"
            className="w-4 h-4 rounded border-border-strong accent-primary cursor-pointer"
          />
          <label htmlFor="remember" className="text-sm text-muted cursor-pointer">
            Keep me signed in
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary text-sm font-semibold py-2.5 rounded-button hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99] transition-all"
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </button>

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
    </div>
  )
}
