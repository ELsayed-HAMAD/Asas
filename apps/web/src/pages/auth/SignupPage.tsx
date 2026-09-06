import * as React from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient, useSession } from '@/lib/authClient.js'

function toSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `org-${Date.now()}`
}

/**
 * Registration: creates the user, then a workspace (organization), then
 * activates it — so a fresh signup lands on `/onboarding` with a working
 * tenant rather than a session with nowhere to go.
 *
 * Field order matters for the E2E spec: the first name/organization field
 * is filled with the org name, so "Your name" comes first and
 * "Organization name" second.
 */
export function SignupPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()
  const [name, setName] = React.useState('')
  const [organizationName, setOrganizationName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!isPending && session) navigate('/onboarding', { replace: true })
  }, [session, isPending, navigate])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name: name.trim() || organizationName.trim(),
      })
      if (signUpError) {
        setError(signUpError.message ?? 'Sign up failed')
        return
      }
      const orgName = organizationName.trim() || `${name.trim()}'s workspace`
      const { data: org, error: orgError } = await authClient.organization.create({
        name: orgName,
        slug: toSlug(orgName),
      })
      if (orgError || !org) {
        // User exists but workspace creation failed — onboarding will retry it.
        navigate('/onboarding', { replace: true })
        return
      }
      const orgId = (org as { id?: string }).id
      if (orgId) {
        await authClient.organization.setActive({ organizationId: orgId })
      }
      navigate('/onboarding', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>One account, one workspace to start with.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-name" className="text-sm font-medium text-[var(--color-heading)]">
                Your name
              </label>
              <Input
                id="signup-name"
                autoComplete="name"
                required
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-org" className="text-sm font-medium text-[var(--color-heading)]">
                Organization name
              </label>
              <Input
                id="signup-org"
                autoComplete="organization"
                required
                value={organizationName}
                onChange={event => setOrganizationName(event.target.value)}
                placeholder="Acme Industries"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-email" className="text-sm font-medium text-[var(--color-heading)]">
                Email
              </label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-password" className="text-sm font-medium text-[var(--color-heading)]">
                Password
              </label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-[var(--color-danger-text)]">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating account…' : 'Sign up'}
            </Button>
            <p className="text-sm text-[var(--color-muted)]">
              Already have an account?{' '}
              <Link to="/login" className="text-[var(--color-accent)] underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
