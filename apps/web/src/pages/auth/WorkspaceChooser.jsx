import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Plus,
  Loader2,
  LogOut,
  ChevronRight
} from 'lucide-react'
import {
  authClient,
  useSession,
  useListOrganizations,
  useActiveOrganization,
  signOut
} from '../../lib/authClient'
import { authErrorMessage } from '../../lib/authErrorMessage'
import { clearOnboardingDraft, onboardingDraftStorage } from '../../lib/onboardingDraft'
import { Button } from '../../components/ui/button'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { AsasLogo } from '../../components/common/AsasLogo'

export default function WorkspaceChooser() {
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending } = useSession()
  const {
    data: organizations,
    isPending: orgsPending,
    error: orgsError,
    refetch: refetchOrganizations,
  } = useListOrganizations()
  const { data: activeOrg } = useActiveOrganization()

  const [activatingId, setActivatingId] = useState(null)
  const [retryingWorkspaces, setRetryingWorkspaces] = useState(false)
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const autoActivationAttempted = useRef(false)

  const orgList = Array.isArray(organizations) ? organizations : []

  // If there's only 1 organization, auto-activate and navigate
  useEffect(() => {
    if (!orgsPending && orgList.length === 1 && !activatingId && !autoActivationAttempted.current) {
      autoActivationAttempted.current = true
      handleSelectWorkspace(orgList[0].id)
    }
  }, [orgsPending, orgList, activatingId])

  const handleSelectWorkspace = async (organizationId) => {
    setActivatingId(organizationId)
    setError('')
    try {
      try {
        localStorage.setItem('asas.lastActiveOrgId', organizationId)
      } catch {
        // The cache is optional; activation below is the source of truth.
      }
      const res = await authClient.organization.setActive({ organizationId })
      if (res?.error) {
        throw new Error(authErrorMessage(res.error, 'Failed to switch workspace.'))
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(authErrorMessage(err, 'Failed to activate selected workspace.'))
      setActivatingId(null)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    setError('')
    try {
      const res = await signOut()
      if (res?.error) {
        throw new Error(authErrorMessage(res.error, 'Failed to sign out.'))
      }
      navigate('/login', { replace: true })
    } catch (err) {
      setError(authErrorMessage(err, 'Failed to sign out.'))
    } finally {
      setSigningOut(false)
    }
  }

  const retryWorkspaceList = async () => {
    setRetryingWorkspaces(true)
    setError('')
    try {
      await refetchOrganizations?.()
    } catch (err) {
      setError(authErrorMessage(err, 'Could not reload your workspaces. Check your connection and try again.'))
    } finally {
      setRetryingWorkspaces(false)
    }
  }

  if (sessionPending || orgsPending) {
    return (
      <div className="auth-deep-blue min-h-screen bg-surface flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted">Loading your workspaces...</p>
      </div>
    )
  }

  return (
    <div className="auth-deep-blue min-h-screen bg-surface flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl">

        {/* Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-card-sm bg-primary text-on-primary flex items-center justify-center shadow-card">
            <AsasLogo className="w-5 h-5 text-on-primary" />
          </div>
          <div>
            <p className="text-xl font-semibold text-heading leading-tight">Asas</p>
            <p className="text-xs text-caption">Business workspace</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-heading mb-1.5">Select a workspace</h1>
              <p className="text-sm text-muted break-words">
                Signed in as <strong className="text-heading font-medium">{session?.user?.email}</strong>
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={signingOut}
              onClick={handleSignOut}
              className="text-xs text-muted hover:text-heading flex shrink-0 items-center gap-1.5"
            >
              {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
              Sign out
            </Button>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Workspaces List */}
          <div className="space-y-3 mb-6">
            {orgsError ? (
              <div className="rounded-card-sm border border-danger-border bg-danger-light px-4 py-6 text-center">
                <p role="alert" className="text-sm font-medium text-danger-text">
                  We could not load your workspaces. Check your connection and try again.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={retryWorkspaceList}
                  disabled={retryingWorkspaces}
                  className="mt-3 border-danger-border bg-surface-raised text-heading hover:bg-surface-muted"
                >
                  {retryingWorkspaces ? <Loader2 size={14} className="animate-spin" /> : null}
                  {retryingWorkspaces ? 'Retrying…' : 'Retry workspace list'}
                </Button>
              </div>
            ) : orgList.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border-subtle rounded-card-sm">
                <Building2 className="w-8 h-8 text-muted mx-auto mb-2" />
                <p className="text-sm font-medium text-heading">No workspaces found</p>
                <p className="text-xs text-muted mt-1 mb-4">
                  You are not currently a member of any workspace.
                </p>
                <Button asChild className="h-9">
                  <Link to="/onboarding?new=1" onClick={() => clearOnboardingDraft(onboardingDraftStorage())}>Create your first workspace</Link>
                </Button>
              </div>
            ) : (
              orgList.map((org) => {
                const isActivating = activatingId === org.id
                const isCurrentActive = activeOrg?.id === org.id
                const initials = (org.name || 'W').slice(0, 2).toUpperCase()

                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => handleSelectWorkspace(org.id)}
                    disabled={Boolean(activatingId)}
                    aria-label={`Open ${org.name}${isCurrentActive ? ' (active workspace)' : ''}`}
                    aria-current={isCurrentActive ? 'true' : undefined}
                    aria-busy={isActivating || undefined}
                    className={`group relative flex w-full items-center justify-between p-4 rounded-card-sm border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-wait ${activatingId && !isActivating ? 'opacity-60' : ''} ${
                      isCurrentActive
                        ? 'bg-primary/5 border-primary/40 hover:border-primary'
                        : 'bg-surface border-border-subtle hover:border-accent hover:bg-surface-muted/50'
                    }`}
                  >
                    <span className="flex items-center gap-3.5 min-w-0">
                      {org.logo ? (
                        <img
                          src={org.logo}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover border border-border-subtle flex-shrink-0"
                        />
                      ) : (
                        <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-sm">
                          {initials}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-heading truncate group-hover:text-primary transition-colors">
                            {org.name}
                          </span>
                          {isCurrentActive && (
                            <span className="inline-flex items-center rounded-badge border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                              Active
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted truncate mt-0.5">
                          {org.slug || 'Workspace'}
                          {org.currency ? ` • ${org.currency}` : ''}
                        </span>
                      </span>
                    </span>

                    <span className="flex items-center gap-2 flex-shrink-0">
                      {isActivating ? (
                        <Loader2 size={16} className="animate-spin text-primary" />
                      ) : (
                        <span className="inline-flex min-h-8 items-center rounded-button px-2 text-xs font-medium text-body group-hover:translate-x-0.5 transition-transform">
                          Open <ChevronRight size={14} className="ml-1" />
                        </span>
                      )}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Create New Workspace Button */}
          <div className="pt-4 border-t border-border-subtle">
            <Button
              asChild
              variant="outline"
              className="w-full h-11 border-dashed hover:border-primary hover:bg-primary/5 flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Link to="/onboarding?new=1" onClick={() => clearOnboardingDraft(onboardingDraftStorage())}>
                <Plus size={16} />
                Create New Workspace
              </Link>
            </Button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-caption mt-6">
          © {new Date().getFullYear()} Asas. All rights reserved.
        </p>

      </div>
    </div>
  )
}
