import type { Integration, IntegrationStatus, IntegrationUpdateInput, IntegrationWriteInput } from '@asas/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toaster, toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/http.js'
import { settingsApi } from '@/lib/api/settings.js'
import { queryKeys } from '@/lib/queryKeys.js'
import { useMyRole } from '@/lib/useMyRole.js'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

const STATUS_VARIANTS: Record<IntegrationStatus, 'success' | 'warning' | 'secondary'> = {
  CONNECTED: 'success',
  CONFIGURE: 'warning',
  DISCONNECTED: 'secondary',
}

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  CONNECTED: 'Connected',
  CONFIGURE: 'Needs configuration',
  DISCONNECTED: 'Disconnected',
}

const ALL_STATUSES: IntegrationStatus[] = ['CONNECTED', 'CONFIGURE', 'DISCONNECTED']

/**
 * Integrations — `GET /settings/integrations` with create/update. Credentials are masked on
 * read; the only place a raw credential travels is the create/update input.
 */
export function IntegrationsPage() {
  const role = useMyRole()
  const canWrite = role === 'ADMIN' || role === 'OWNER'
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.settings.integrations.all(),
    queryFn: () => settingsApi.getIntegrations(),
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Integration | null>(null)
  const [createForm, setCreateForm] = useState<IntegrationWriteInput>({
    name: '',
    description: null,
    status: 'CONFIGURE',
    syncPullRequests: false,
    syncCiCdStatus: false,
    credential: null,
  })
  const [editForm, setEditForm] = useState<IntegrationUpdateInput>({})
  const [credentialMode, setCredentialMode] = useState<'none' | 'set' | 'clear'>('none')
  const [credentialValue, setCredentialValue] = useState('')

  const integrations = data?.items ?? []
  const summary = data?.summary

  const createIntegration = useMutation({
    mutationFn: (input: IntegrationWriteInput) => settingsApi.createIntegration(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.integrations.all() })
      toast({ title: 'Integration added' })
      setCreateOpen(false)
      setCreateForm({ name: '', description: null, status: 'CONFIGURE', syncPullRequests: false, syncCiCdStatus: false, credential: null })
    },
    onError: e => toast({ variant: 'error', title: 'Failed to add integration', description: errorMessage(e, 'Try again.') }),
  })

  const updateIntegration = useMutation({
    mutationFn: ({ id, input }: { id: string; input: IntegrationUpdateInput }) =>
      settingsApi.updateIntegration(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.integrations.all() })
      toast({ title: 'Integration updated' })
      setEditTarget(null)
      setEditForm({})
      setCredentialMode('none')
      setCredentialValue('')
    },
    onError: e => toast({ variant: 'error', title: 'Failed to update', description: errorMessage(e, 'Try again.') }),
  })

  function openEdit(integration: Integration) {
    setEditTarget(integration)
    setEditForm({
      name: integration.name,
      description: integration.description,
      status: integration.status,
      syncPullRequests: integration.syncPullRequests,
      syncCiCdStatus: integration.syncCiCdStatus,
    })
    setCredentialMode('none')
    setCredentialValue('')
  }

  function saveEdit() {
    if (!editTarget) return
    const input: IntegrationUpdateInput = { ...editForm }
    if (credentialMode === 'set' && credentialValue) {
      input.credential = { value: credentialValue }
    } else if (credentialMode === 'clear') {
      input.credential = { clear: true }
    } else {
      delete input.credential
    }
    updateIntegration.mutate({ id: editTarget.id, input })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-heading)]">Integrations</h1>
          <p className="text-sm text-[var(--color-muted)]">Connected services and sync settings</p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Add integration
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Connected</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{summary?.connectedCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{summary?.total ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {isError ? (
        <p className="text-sm text-[var(--color-danger)]">Could not load integrations.</p>
      ) : isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : integrations.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[var(--color-muted)]">No integrations configured yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {integrations.map(integration => (
            <Card key={integration.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold text-[var(--color-heading)]">{integration.name}</span>
                      <Badge variant={STATUS_VARIANTS[integration.status]}>
                        {STATUS_LABELS[integration.status]}
                      </Badge>
                    </div>
                    {integration.description && (
                      <p className="mt-1 text-sm text-[var(--color-muted)]">{integration.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-4 text-xs text-[var(--color-muted)]">
                      {integration.credential.configured ? (
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                          Credential: <code className="text-[var(--color-body)]">{integration.credential.masked}</code>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)]" />
                          No credential
                        </span>
                      )}
                      {integration.syncPullRequests && <span>PR sync: on</span>}
                      {integration.syncCiCdStatus && <span>CI/CD sync: on</span>}
                    </div>
                  </div>
                  {canWrite && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(integration)}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add integration</DialogTitle>
            <DialogDescription>Connect a new service or tool.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Name</label>
              <Input
                value={createForm.name}
                onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="GitHub"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Description (optional)</label>
              <Input
                value={createForm.description ?? ''}
                onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value || null }))}
                placeholder="Pull request and CI/CD sync"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Status</label>
              <Select
                value={createForm.status ?? 'CONFIGURE'}
                onValueChange={(v: string) => setCreateForm(prev => ({ ...prev, status: v as IntegrationStatus }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Credential (optional)</label>
              <Input
                type="password"
                value={createForm.credential ?? ''}
                onChange={e => setCreateForm(prev => ({ ...prev, credential: e.target.value || null }))}
                placeholder="API key or token"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--color-body)]">
                <input
                  type="checkbox"
                  checked={createForm.syncPullRequests ?? false}
                  onChange={e => setCreateForm(prev => ({ ...prev, syncPullRequests: e.target.checked }))}
                />
                Sync pull requests
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--color-body)]">
                <input
                  type="checkbox"
                  checked={createForm.syncCiCdStatus ?? false}
                  onChange={e => setCreateForm(prev => ({ ...prev, syncCiCdStatus: e.target.checked }))}
                />
                Sync CI/CD status
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}><X /> Cancel</Button>
            <Button
              disabled={!createForm.name || createIntegration.isPending}
              onClick={() => createIntegration.mutate(createForm)}
            >
              {createIntegration.isPending ? 'Adding…' : 'Add integration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={open => { if (!open) setEditTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editTarget?.name}</DialogTitle>
            <DialogDescription>Update sync settings, status, and credentials.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Name</label>
              <Input
                value={editForm.name ?? ''}
                onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Description</label>
              <Input
                value={editForm.description ?? ''}
                onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Status</label>
              <Select
                value={editForm.status ?? 'CONFIGURE'}
                onValueChange={(v: string) => setEditForm(prev => ({ ...prev, status: v as IntegrationStatus }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-heading)]">Credential</label>
              <div className="flex items-center gap-2">
                <Select
                  value={credentialMode}
                  onValueChange={(v: string) => setCredentialMode(v as 'none' | 'set' | 'clear')}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Keep as-is</SelectItem>
                    <SelectItem value="set">Set new</SelectItem>
                    <SelectItem value="clear">Clear</SelectItem>
                  </SelectContent>
                </Select>
                {credentialMode === 'set' && (
                  <Input
                    type="password"
                    value={credentialValue}
                    onChange={e => setCredentialValue(e.target.value)}
                    placeholder="New API key or token"
                  />
                )}
                {credentialMode === 'clear' && (
                  <span className="text-sm text-[var(--color-danger)]">Credential will be removed</span>
                )}
              </div>
              {editTarget?.credential.configured && credentialMode === 'none' && (
                <p className="text-xs text-[var(--color-muted)]">
                  Current: <code>{editTarget.credential.masked}</code>
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--color-body)]">
                <input
                  type="checkbox"
                  checked={editForm.syncPullRequests ?? false}
                  onChange={e => setEditForm(prev => ({ ...prev, syncPullRequests: e.target.checked }))}
                />
                Sync pull requests
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--color-body)]">
                <input
                  type="checkbox"
                  checked={editForm.syncCiCdStatus ?? false}
                  onChange={e => setEditForm(prev => ({ ...prev, syncCiCdStatus: e.target.checked }))}
                />
                Sync CI/CD status
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}><X /> Cancel</Button>
            <Button disabled={updateIntegration.isPending} onClick={saveEdit}>
              {updateIntegration.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  )
}
