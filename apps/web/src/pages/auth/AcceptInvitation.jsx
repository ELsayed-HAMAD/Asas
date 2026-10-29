import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  UserCheck,
  LogOut,
  RefreshCw
} from 'lucide-react'
import { authClient, useSession, signIn, signUp, signOut } from '../../lib/authClient'
import { authErrorMessage, AUTH_SERVICE_UNREACHABLE } from '../../lib/authErrorMessage'
import { validatePasswordPolicy, PASSWORD_POLICY_DESCRIPTION } from '../../lib/passwordPolicy'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'

export default function AcceptInvitation() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const invitationId = searchParams.get('invitationId')

  const { data: session, isPending: sessionLoading } = useSession()

  const [invitation, setInvitation] = useState(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [inviteError, setInviteError] = useState('')
  const [inviteReloadKey, setInviteReloadKey] = useState(0)

  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [declined, setDeclined] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetNotice, setResetNotice] = useState('')
  const [resetError, setResetError] = useState('')

  // Auth form states for signed-out users
  const [mode, setMode] = useState('register') // 'register' | 'login'
  const [authForm, setAuthForm] = useState({ name: '', password: '' })

  // 1. Fetch invitation metadata
  useEffect(() => {
    if (!invitationId) {
      setLoadingInvite(false)
      setInviteError('No invitation token was provided in the link.')
      return
    }

    let isMounted = true
    async function fetchInvitation() {
      setLoadingInvite(true)
      setInvitation(null)
      setInviteError('')
      try {
        const res = await authClient.organization.getInvitation({
          query: { id: invitationId },
        })

        if (!isMounted) return
        if (res?.error) {
          throw new Error(res.error.message || 'Invitation not found or has expired.')
        }

        setInvitation(res.data)
      } catch (err) {
        if (!isMounted) return
        setInviteError(authErrorMessage(err, 'Unable to load invitation details.'))
      } finally {
        if (isMounted) setLoadingInvite(false)
      }
    }

    fetchInvitation()
    return () => { isMounted = false }
  }, [invitationId, inviteReloadKey])

  const activateJoinedWorkspace = async organizationId => {
    if (!organizationId) return true
    try {
      localStorage.setItem('asas.lastActiveOrgId', organizationId)
    } catch {
      // The cache is optional; activation below is the source of truth.
    }
    try {
      const activeRes = await authClient.organization.setActive({ organizationId })
      if (activeRes?.error) {
        // Acceptance succeeded, so send the member to the chooser rather than opening an old workspace.
        navigate('/choose-workspace', { replace: true })
        return false
      }
      return true
    } catch {
      // The invitation may already be accepted. Do not imply acceptance failed just because
      // activation could not be confirmed over the network.
      navigate('/choose-workspace', { replace: true })
      return false
    }
  }

  // Handle Accept for signed-in user
  const handleAccept = async () => {
    if (!invitationId) return
    setActionLoading(true)
    setActionError('')
    try {
      const res = await authClient.organization.acceptInvitation({ invitationId })
      if (res?.error) {
        throw new Error(authErrorMessage(res.error, 'Failed to accept invitation.'))
      }

      const orgId = invitation?.organizationId || res?.data?.organizationId
      if (!(await activateJoinedWorkspace(orgId))) return
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setActionError(authErrorMessage(err, 'Failed to accept invitation.'))
      setActionLoading(false)
    }
  }

  // Handle Reject for signed-in user
  const handleReject = async () => {
    if (!invitationId) return
    setActionLoading(true)
    setActionError('')
    try {
      const res = await authClient.organization.rejectInvitation({ invitationId })
      if (res?.error) {
        throw new Error(authErrorMessage(res.error, 'Failed to decline invitation.'))
      }
      setDeclined(true)
    } catch (err) {
      setActionError(authErrorMessage(err, 'Failed to decline invitation.'))
    } finally {
      setActionLoading(false)
    }
  }

  // Handle Registration for unauthenticated user
  const handleRegisterAndJoin = async (e) => {
    e.preventDefault()
    setActionError('')

    const policyErr = validatePasswordPolicy(authForm.password)
    if (policyErr) {
      setActionError(policyErr)
      return
    }

    setActionLoading(true)
    try {
      const targetEmail = invitation?.email || ''
      if (!targetEmail) {
        throw new Error('This invitation has no email address. Ask the workspace owner to send a new invitation.')
      }
      const res = await signUp.email({
        email: targetEmail,
        password: authForm.password,
        name: authForm.name.trim() || undefined,
        callbackURL: `${window.location.origin}/accept-invitation?invitationId=${invitationId}`,
      })

      if (res?.error) {
        throw new Error(authErrorMessage(res.error, 'Failed to create your account.'))
      }

      // Email/password accounts must verify their address before Better Auth creates a session.
      // Keep the invite callback through verification; acceptance happens when the user returns.
      const callbackURL = `${window.location.origin}/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`
      const verifyQuery = new URLSearchParams({ email: targetEmail, callbackURL })
      navigate(`/verify-email?${verifyQuery.toString()}`, {
        replace: true,
        state: { email: targetEmail, callbackURL, invitationId },
      })
    } catch (err) {
      setActionError(authErrorMessage(err, 'Failed to create your account. The invitation is unchanged and you can retry.'))
      setActionLoading(false)
    }
  }

  // Handle Login for unauthenticated user
  const handleLoginAndJoin = async (e) => {
    e.preventDefault()
    setActionError('')
    setActionLoading(true)
    try {
      const targetEmail = invitation?.email || ''
      if (!targetEmail) {
        throw new Error('This invitation has no email address. Ask the workspace owner to send a new invitation.')
      }
      const res = await signIn.email({
        email: targetEmail,
        password: authForm.password,
      })

      if (res?.error) {
        const message = authErrorMessage(res.error, 'Invalid email or password.')
        const isUnverified =
          res.error?.code === 'EMAIL_NOT_VERIFIED' ||
          /email.*not.*verified|not.*verified/i.test(message) ||
          /email.*not.*verified|not.*verified/i.test(String(res.error?.message || ''))
        if (isUnverified) {
          const callbackURL = `${window.location.origin}/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`
          const verifyQuery = new URLSearchParams({ email: targetEmail, callbackURL })
          navigate(`/verify-email?${verifyQuery.toString()}`, {
            replace: true,
            state: { email: targetEmail, callbackURL, invitationId },
          })
          return
        }
        throw new Error(message)
      }

      // Automatically accept the invitation
      const acceptRes = await authClient.organization.acceptInvitation({ invitationId })
      if (acceptRes?.error) {
        throw new Error(authErrorMessage(acceptRes.error, 'Signed in, but failed to accept workspace invitation.'))
      }

      const orgId = invitation?.organizationId || acceptRes?.data?.organizationId
      if (!(await activateJoinedWorkspace(orgId))) return
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setActionError(authErrorMessage(err, 'Failed to sign in and accept.'))
      setActionLoading(false)
    }
  }

  const handleSignOut = async () => {
    setActionLoading(true)
    try {
      await signOut()
    } finally {
      setActionLoading(false)
    }
  }

  const handleInvitationPasswordReset = async () => {
    const targetEmail = invitation?.email || ''
    if (!targetEmail || resetLoading) return
    setResetLoading(true)
    setResetNotice('')
    setResetError('')
    try {
      const invitationPath = `/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`
      const redirectTo = `${window.location.origin}/reset-password?returnTo=${encodeURIComponent(invitationPath)}`
      const res = await authClient.requestPasswordReset({ email: targetEmail, redirectTo })
      if (res?.error) {
        throw new Error(authErrorMessage(res.error, 'Could not send a password reset link.'))
      }
      setResetNotice(`If an account exists for ${targetEmail}, a reset link was sent. It will return you to this invitation.`)
    } catch (err) {
      setResetError(authErrorMessage(err, 'Could not send a password reset link.'))
    } finally {
      setResetLoading(false)
    }
  }

  // Loading states
  if (sessionLoading || loadingInvite) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted">Validating workspace invitation...</p>
      </div>
    )
  }

  // Error state
  if (inviteError || !invitation) {
    const serviceUnavailable = inviteError === AUTH_SERVICE_UNREACHABLE
    return (
      <div className="flex flex-col text-center">
        <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-2xl font-semibold text-heading mb-2">
          {serviceUnavailable ? 'Cannot Load Invitation' : 'Invitation Unavailable'}
        </h1>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          {serviceUnavailable
            ? inviteError
            : inviteError || 'This invitation link is invalid, has expired, or has already been accepted.'}
        </p>
        <div className="w-full space-y-2">
          {invitationId && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setInviteReloadKey(key => key + 1)}
              className="w-full h-10 flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} />
              Try Again
            </Button>
          )}
          <Button asChild className="w-full h-10">
            <Link to="/login" className="flex items-center justify-center gap-2">
              Continue to Sign In <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  // Declined state
  if (declined) {
    return (
      <div className="flex flex-col text-center">
        <div className="w-12 h-12 rounded-full bg-surface-muted text-muted flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={24} />
        </div>
        <h1 className="text-2xl font-semibold text-heading mb-2">Invitation Declined</h1>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          You have declined the invitation to join{' '}
          <strong className="text-heading font-medium">{invitation.organizationName || 'the workspace'}</strong>.
        </p>
        <Button asChild variant="outline" className="w-full h-10">
          <Link to="/login">Return to Sign In</Link>
        </Button>
      </div>
    )
  }

  const orgName = invitation.organizationName || 'Workspace'
  const invitedEmail = invitation.email || ''
  const invitedRole = invitation.role || 'MEMBER'
  const isEmailMismatch = Boolean(
    session?.user?.email &&
    invitedEmail &&
    session.user.email.toLowerCase() !== invitedEmail.toLowerCase()
  )

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
          <Building2 size={24} />
        </div>
        <h1 className="text-2xl font-semibold text-heading mb-1.5">Workspace Invitation</h1>
        <p className="text-sm text-muted">
          You've been invited to join <strong className="text-heading font-medium">{orgName}</strong> on Asas.
        </p>
      </div>

      {actionError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Action Failed</AlertTitle>
          <AlertDescription className="text-xs">{actionError}</AlertDescription>
        </Alert>
      )}

      {/* Invitation Overview Card */}
      <div className="bg-surface border border-border-subtle rounded-card-sm p-4 mb-6 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-caption">Workspace</span>
          <span className="font-semibold text-heading">{orgName}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-caption">Assigned Role</span>
          <Badge variant="outline" className="text-xs font-semibold uppercase">
            {invitedRole}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-caption">Invited Email</span>
          <span className="text-body font-mono text-xs">{invitedEmail || 'Not provided'}</span>
        </div>
      </div>

      {/* Signed-in flow */}
      {session?.user ? (
        <div className="space-y-4">
          {isEmailMismatch ? (
            <Alert variant="destructive" className="mb-2">
              <AlertDescription className="text-xs space-y-2">
                <p>
                  You are currently signed in as <strong>{session.user.email}</strong>, but this invitation was sent to{' '}
                  <strong>{invitedEmail}</strong>.
                </p>
                <p>To accept this invitation, sign out and sign in with the invited email address.</p>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-surface-muted/50 rounded-card-sm text-xs text-muted mb-2">
              <UserCheck size={16} className="text-success flex-shrink-0" />
              <span>
                Signed in as <strong className="text-heading font-medium">{session.user.email}</strong>
              </span>
            </div>
          )}

          {isEmailMismatch ? (
            <Button
              type="button"
              variant="outline"
              disabled={actionLoading}
              onClick={handleSignOut}
              className="w-full h-10 flex items-center justify-center gap-2 cursor-pointer"
            >
              {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
              Sign Out & Switch Account
            </Button>
          ) : (
            <div className="space-y-2">
              <Button
                type="button"
                disabled={actionLoading}
                onClick={handleAccept}
                className="w-full h-10 flex items-center justify-center gap-2 cursor-pointer"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Accept & Join Workspace
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={actionLoading}
                onClick={handleReject}
                className="w-full h-9 text-muted hover:text-danger cursor-pointer"
              >
                Decline Invitation
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Signed-out flow: quick registration or login */
        <div>
          {/* Mode Tabs */}
          <div className="flex border-b border-border-subtle mb-4">
            <button
              type="button"
              onClick={() => { setMode('register'); setActionError('') }}
              aria-label="Create account and join workspace"
              aria-pressed={mode === 'register'}
              aria-controls="invitation-register-form"
              className={`flex-1 pb-2.5 text-xs font-medium text-center border-b-2 transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted hover:text-body'
              }`}
            >
              Create Account & Join
            </button>
            <button
              type="button"
              onClick={() => { setMode('login'); setActionError('') }}
              aria-label="Sign in and join workspace"
              aria-pressed={mode === 'login'}
              aria-controls="invitation-login-form"
              className={`flex-1 pb-2.5 text-xs font-medium text-center border-b-2 transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted hover:text-body'
              }`}
            >
              Already Have an Account?
            </button>
          </div>

          {mode === 'register' ? (
            <form id="invitation-register-form" onSubmit={handleRegisterAndJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1" htmlFor="name">
                  Full Name
                </label>
                <Input
                  id="name"
                  type="text"
                  value={authForm.name}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Your full name"
                  autoComplete="name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-1" htmlFor="email">
                  Work Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={invitedEmail}
                  autoComplete="email"
                  disabled
                  className="bg-surface-muted cursor-not-allowed opacity-80"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-1" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  aria-describedby="invitation-password-policy"
                  required
                />
                <p id="invitation-password-policy" className="text-[11px] text-caption mt-1">{PASSWORD_POLICY_DESCRIPTION}</p>
              </div>

              <Button
                type="submit"
                disabled={actionLoading || !authForm.name || !authForm.password}
                className="w-full h-10 mt-2 cursor-pointer"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Create Account & Join'}
              </Button>
            </form>
          ) : (
            <form id="invitation-login-form" onSubmit={handleLoginAndJoin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1" htmlFor="loginEmail">
                  Work Email
                </label>
                <Input
                  id="loginEmail"
                  type="email"
                  value={invitedEmail}
                  autoComplete="email"
                  disabled
                  className="bg-surface-muted cursor-not-allowed opacity-80"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-1" htmlFor="loginPassword">
                  Password
                </label>
                <Input
                  id="loginPassword"
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={actionLoading || !authForm.password}
                className="w-full h-10 mt-2 cursor-pointer"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Sign In & Join'}
              </Button>

              <div className="rounded-card-sm border border-border-subtle bg-surface-muted/40 px-3 py-3 text-center">
                <p className="text-xs text-muted">Forgot the password for this invitation email?</p>
                <button
                  type="button"
                  onClick={handleInvitationPasswordReset}
                  disabled={resetLoading || !invitedEmail}
                  className="mt-1 text-xs font-semibold text-heading hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {resetLoading ? 'Sending reset link...' : 'Email me a reset link'}
                </button>
                {resetNotice && <p role="status" className="mt-2 text-[11px] leading-relaxed text-success-text">{resetNotice}</p>}
                {resetError && <p role="alert" className="mt-2 text-[11px] leading-relaxed text-danger">{resetError}</p>}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 text-center">
        <Link to="/login" className="text-xs text-muted hover:text-heading transition-colors">
          Return to Sign In
        </Link>
      </div>
    </div>
  )
}
