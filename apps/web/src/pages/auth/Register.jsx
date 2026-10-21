import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { signUp, useSession, signOut, authClient } from '../../lib/authClient'
import { authApi } from '../../lib/api/auth'
import DevSocialModal from '../../components/auth/DevSocialModal'
import { GoogleIcon, AppleIcon } from '../../components/common/BrandIcons'
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
  const [devModalOpen, setDevModalOpen] = useState(false)
  const [devModalProvider, setDevModalProvider] = useState('google')

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

  const handleSocialSignUp = async (provider) => {
    setError('')
    try {
      // Check if real OAuth provider is configured on the backend
      const statusRes = await authApi.getProviders().catch(() => null)
      const providers = statusRes?.data || statusRes || {}

      if (providers[provider]) {
        const res = await authClient.signIn.social({
          provider,
          callbackURL: `${window.location.origin}/onboarding`,
        })
        if (res?.error) {
          setError(res.error?.message || `${provider === 'apple' ? 'Apple' : 'Google'} sign-up is not configured in this environment. Please sign up with your work email below.`)
        }
      } else if (providers.devAuthAllowed) {
        // Open local development SSO sandbox
        setDevModalProvider(provider)
        setDevModalOpen(true)
      } else {
        setError(`${provider === 'apple' ? 'Apple' : 'Google'} single sign-on is not configured in this enterprise environment. Please register with your corporate email below.`)
      }
    } catch (socialErr) {
      setError(socialErr?.message || `${provider === 'apple' ? 'Apple' : 'Google'} sign-up is currently unavailable in this environment.`)
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-heading mb-1.5">Create your enterprise workspace</h1>
        <p className="text-sm text-muted">Create a secure workspace for your company’s finance, people, and daily operations.</p>
      </div>

      {/* Social SSO Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSocialSignUp('google')}
          className="w-full flex items-center justify-center gap-2 text-xs font-medium h-10 border-border/80 hover:bg-surface-raised hover-lift transition-micro active:scale-[0.98] cursor-pointer shadow-xs"
        >
          <GoogleIcon className="w-4 h-4" />
          <span>Google</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSocialSignUp('apple')}
          className="w-full flex items-center justify-center gap-2 text-xs font-medium h-10 border-border/80 hover:bg-surface-raised hover-lift transition-micro active:scale-[0.98] cursor-pointer shadow-xs"
        >
          <AppleIcon className="w-4 h-4" />
          <span>Apple</span>
        </Button>
      </div>

      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-surface-raised px-3 text-xs text-caption">or register with work email</span>
        </div>
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
          className="w-full h-10 mt-4 cursor-pointer shadow-card hover:shadow-glow hover-lift transition-micro active:scale-[0.98]"
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

      <DevSocialModal
        isOpen={devModalOpen}
        onClose={() => setDevModalOpen(false)}
        provider={devModalProvider}
        onSuccess={(data) => {
          setDevModalOpen(false)
          window.location.assign(data.redirectUrl || '/onboarding')
        }}
      />
    </div>
  )
}
