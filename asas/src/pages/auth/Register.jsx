import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { authService } from '../../services/auth.service'

export default function Register() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')

  const handleChange = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const result = await authService.register(form)
      localStorage.setItem('asas_token', result.token)
      localStorage.setItem('asas_user', JSON.stringify(result.user))
      navigate('/dashboard')
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Unable to create your workspace.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-heading mb-1.5">Create your workspace</h1>
        <p className="text-sm text-muted">Set up your account to start managing your enterprise.</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="px-3.5 py-2.5 bg-danger-light border border-danger-border rounded-button text-sm text-danger">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-body mb-1.5" htmlFor="name">
            Full Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder="Jane Doe"
            required
            className="w-full px-3 py-2.5 text-sm border border-border-default rounded-button focus:outline-none focus:ring-4 focus:ring-surface-active focus:border-border-strong transition-all placeholder:text-caption"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1.5" htmlFor="email">
            Work Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="name@company.com"
            required
            className="w-full px-3 py-2.5 text-sm border border-border-default rounded-button focus:outline-none focus:ring-4 focus:ring-surface-active focus:border-border-strong transition-all placeholder:text-caption"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1.5" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Create a strong password"
            required
            className="w-full px-3 py-2.5 text-sm border border-border-default rounded-button focus:outline-none focus:ring-4 focus:ring-surface-active focus:border-border-strong transition-all placeholder:text-caption"
          />
          <p className="text-[11px] text-caption mt-1.5">Must be at least 12 characters and include a symbol.</p>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary text-on-primary text-sm font-medium py-2.5 rounded-button hover:bg-primary-hover focus:outline-none focus:ring-4 focus:ring-surface-strong transition-all disabled:opacity-70 flex items-center justify-center gap-2 mt-4"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Create Account'}
        </button>
      </form>

      {/* TOS Disclaimer */}
      <p className="mt-5 text-center text-xs text-caption leading-relaxed">
        By clicking "Create Account", you agree to our{' '}
        <a href="#" className="underline hover:text-body">Terms of Service</a> and{' '}
        <a href="#" className="underline hover:text-body">Privacy Policy</a>.
      </p>

      {/* Footer Link */}
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-heading hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
