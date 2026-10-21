import { useState, useEffect } from 'react'
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
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Alert, AlertDescription } from '../../components/ui/alert'

export default function WorkspaceChooser() {
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending } = useSession()
  const { data: organizations, isPending: orgsPending } = useListOrganizations()
  const { data: activeOrg } = useActiveOrganization()

  const [activatingId, setActivatingId] = useState(null)
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  const orgList = Array.isArray(organizations) ? organizations : []

  // If there's only 1 organization, auto-activate and navigate
  useEffect(() => {
    if (!orgsPending && orgList.length === 1 && !activatingId) {
      handleSelectWorkspace(orgList[0].id)
    }
  }, [orgsPending, orgList])

  const handleSelectWorkspace = async (organizationId) => {
    setActivatingId(organizationId)
    setError('')
    try {
      localStorage.setItem('asas.lastActiveOrgId', organizationId)
      const res = await authClient.organization.setActive({ organizationId })
      if (res?.error) {
        throw new Error(res.error.message || 'Failed to switch workspace.')
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message || 'Failed to activate selected workspace.')
      setActivatingId(null)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err?.message || 'Failed to sign out.')
    } finally {
      setSigningOut(false)
    }
  }

  if (sessionPending || orgsPending) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted">Loading your workspaces...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl">

        {/* Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-card-sm bg-primary text-on-primary flex items-center justify-center text-xl font-bold">
            A
          </div>
          <div>
            <p className="text-xl font-semibold text-heading leading-tight">Asas</p>
            <p className="text-xs text-caption">Enterprise ERP</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-surface-raised rounded-card border border-border-subtle shadow-card p-6 sm:p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-heading mb-1.5">Select a Workspace</h1>
              <p className="text-sm text-muted">
                Signed in as <strong className="text-heading font-medium">{session?.user?.email}</strong>
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={signingOut}
              onClick={handleSignOut}
              className="text-xs text-muted hover:text-heading flex items-center gap-1.5"
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
            {orgList.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border-subtle rounded-card-sm">
                <Building2 className="w-8 h-8 text-muted mx-auto mb-2" />
                <p className="text-sm font-medium text-heading">No workspaces found</p>
                <p className="text-xs text-muted mt-1 mb-4">
                  You are not currently a member of any workspace.
                </p>
                <Button asChild className="h-9">
                  <Link to="/onboarding">Create Your First Workspace</Link>
                </Button>
              </div>
            ) : (
              orgList.map((org) => {
                const isActivating = activatingId === org.id
                const isCurrentActive = activeOrg?.id === org.id
                const initials = (org.name || 'W').slice(0, 2).toUpperCase()

                return (
                  <div
                    key={org.id}
                    onClick={() => !isActivating && handleSelectWorkspace(org.id)}
                    className={`group relative flex items-center justify-between p-4 rounded-card-sm border transition-all cursor-pointer ${
                      isCurrentActive
                        ? 'bg-primary/5 border-primary/40 hover:border-primary'
                        : 'bg-surface border-border-subtle hover:border-accent hover:bg-surface-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {org.logo ? (
                        <img
                          src={org.logo}
                          alt={org.name}
                          className="w-10 h-10 rounded-lg object-cover border border-border-subtle flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-sm">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-heading truncate group-hover:text-primary transition-colors">
                            {org.name}
                          </p>
                          {isCurrentActive && (
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted truncate mt-0.5">
                          {org.slug || 'Workspace'}
                          {org.currency ? ` • ${org.currency}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isActivating ? (
                        <Loader2 size={16} className="animate-spin text-primary" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs group-hover:translate-x-0.5 transition-transform"
                        >
                          Launch <ChevronRight size={14} className="ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
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
              <Link to="/onboarding">
                <Plus size={16} />
                Create New Workspace
              </Link>
            </Button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-caption mt-6">
          © {new Date().getFullYear()} Asas Enterprise ERP. All rights reserved.
        </p>

      </div>
    </div>
  )
}
