import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { signUp, useSession, signOut } from '../../lib/authClient'
import { validatePasswordPolicy, PASSWORD_POLICY_DESCRIPTION } from '../../lib/passwordPolicy'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Alert, AlertDescription } from '../../components/ui/alert'

export default function Register() {
  const navigate = useNavigate()
  const { data: session } = useSession()
  const [signingOut, setSigningOut] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')

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
      <div className="flex flex-col text-center">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-heading mb-1.5">Already signed in</h1>
          <p className="text-sm text-muted">
            You are currently signed in as <strong className="text-heading font-medium">{session.user.email}</strong>.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <Link
            to="/onboarding"
            className="w-full bg-primary text-on-primary text-sm font-medium py-2.5 rounded-button hover:bg-primary-hover transition-all flex items-center justify-center gap-2"
          >
            Continue to Workspace
          </Link>
          <Button
            type="button"
            variant="outline"
            disabled={signingOut}
            onClick={handleSignOut}
            className="w-full h-10"
          >
            {signingOut ? <Loader2 size={16} className="animate-spin" /> : 'Sign out to create a new account'}
          </Button>
        </div>
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
      const signUpResult = await signUp.email({
        email: form.email,
        password: form.password,
        name: name || undefined,
        callbackURL: `${window.location.origin}/onboarding`,
      })
      if (signUpResult?.error) {
        throw new Error(signUpResult.error.message || 'Could not create your account.')
      }

      navigate('/verify-email', { state: { email: form.email, name } })
    } catch (requestError) {
      setError(requestError?.message || requestError?.error?.message || 'Unable to create your account.')
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
        {error && (
          <Alert variant="destructive" className="mb-4">
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
          <label className="block text-sm font-medium text-body mb-1.5" htmlFor="name">
            Full Name
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder="Jane Doe"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1.5" htmlFor="email">
            Work Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="name@company.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-1.5" htmlFor="password">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Create a strong password"
            required
          />
          <p className="text-[11px] text-caption mt-1.5">{PASSWORD_POLICY_DESCRIPTION}</p>
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-10 mt-4 cursor-pointer"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Create Account'}
        </Button>
      </form>

      {/* TOS Disclaimer */}
      <p className="mt-5 text-center text-xs text-caption leading-relaxed">
        By clicking "Create Account", you agree to our{' '}
        <Link to="/terms" className="underline hover:text-body">Terms of Service</Link> and{' '}
        <Link to="/privacy" className="underline hover:text-body">Privacy Policy</Link>.
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
