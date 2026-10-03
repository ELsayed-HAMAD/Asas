import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useNavigate } from 'react-router'
import type { ImportEmployeeRow } from '@asas/contracts'
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
import { Toaster, toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/http.js'
import { onboardingApi } from '@/lib/api/onboarding.js'
import { authClient, useActiveOrganization, useListOrganizations, useSession } from '@/lib/authClient.js'

function toSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `org-${Date.now()}`
}

/**
 * The preserved 3-path onboarding flow — empty / sample / import (rebuild plan, Preserve
 * section) — plus the workspace picker for users who belong to several organizations.
 *
 * The legacy page showed "coming soon" stubs; here all three paths are real:
 *
 * - **Empty** — create (or keep) a workspace and enter it with no data.
 * - **Sample** — `POST /onboarding/sample` applies the enterprise seed pack; payroll is
 *   priced through the domain layer server-side, never the pack's precomputed numbers, and
 *   the tenant is marked `SAMPLE_LOADED` so every page can label it visibly.
 * - **Import** — `POST /onboarding/import` bulk-creates employees from pasted JSON.
 *
 * When the session has no active organization and the user belongs to more than one, the
 * picker lists them (the plan's "workspace picker closes for free" moment); a single-org
 * user is taken straight through.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session, isPending: sessionPending } = useSession()
  const { data: activeOrganization, isPending: orgPending } = useActiveOrganization()
  const { data: organizations } = useListOrganizations()
  const [orgName, setOrgName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)

  React.useEffect(() => {
    if (!sessionPending && !session) navigate('/login', { replace: true })
  }, [session, sessionPending, navigate])

  const sampleMutation = useMutation({
    mutationFn: () => onboardingApi.applySample(),
    onSuccess: result => {
      const rows = Object.values(result.summary).reduce((total, count) => total + count, 0)
      toast({
        title: 'Sample data loaded',
        description: `${rows} rows across ${Object.keys(result.summary).length} sections — labeled as sample data throughout.`,
      })
      // The pack seeded every module; drop every cached query so the next visit refetches.
      void queryClient.invalidateQueries()
      navigate('/finance', { replace: true })
    },
    onError: mutationError => toast({
      variant: 'error',
      title: 'Could not load sample data',
      description: mutationError instanceof ApiError ? mutationError.message : 'Try again.',
    }),
  })

  if (sessionPending || orgPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)]">
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      </div>
    )
  }

  async function ensureActive(orgId: string) {
    await authClient.organization.setActive({ organizationId: orgId })
    navigate('/hr/employees', { replace: true })
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const name = orgName.trim()
      if (!name) {
        setError('Give your workspace a name first.')
        return
      }
      const { data: org, error: orgError } = await authClient.organization.create({
        name,
        slug: toSlug(name),
      })
      if (orgError || !org) {
        setError(orgError?.message ?? 'Workspace creation failed')
        return
      }
      const orgId = (org as { id?: string }).id
      if (!orgId) {
        setError('Workspace created but no id was returned')
        return
      }
      await ensureActive(orgId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace creation failed')
    } finally {
      setBusy(false)
    }
  }

  const hasMultipleOrgs = (organizations?.length ?? 0) > 1 && !activeOrganization

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set up your workspace</CardTitle>
          <CardDescription>
            {activeOrganization
              ? `"${activeOrganization.name}" is ready. Choose how to start.`
              : 'Create a workspace to hold your HR, finance, CRM, and project data.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasMultipleOrgs ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-[var(--color-heading)]">Choose a workspace</p>
              {(organizations ?? []).map(org => (
                <Button
                  key={org.id}
                  variant="outline"
                  onClick={() => void ensureActive(org.id)}
                >
                  {org.name}
                </Button>
              ))}
            </div>
          ) : activeOrganization ? (
            <Button onClick={() => navigate('/hr/employees', { replace: true })}>
              Start with empty workspace
            </Button>
          ) : (
            <form onSubmit={createWorkspace} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="onboarding-org" className="text-sm font-medium text-[var(--color-heading)]">
                  Organization name
                </label>
                <Input
                  id="onboarding-org"
                  autoComplete="organization"
                  required
                  value={orgName}
                  onChange={event => setOrgName(event.target.value)}
                  placeholder="Acme Industries"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-[var(--color-danger-text)]">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating workspace…' : 'Start with empty workspace'}
              </Button>
            </form>
          )}

          {activeOrganization && (
            <div className="flex flex-col gap-2 border-t border-[var(--color-border-default)] pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={sampleMutation.isPending}
                onClick={() => sampleMutation.mutate()}
              >
                {sampleMutation.isPending
                  ? 'Loading sample data…'
                  : 'Load sample data (recommended for exploring)'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
                Import data
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <Toaster />
    </div>
  )
}

function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [raw, setRaw] = React.useState('')
  const [parseError, setParseError] = React.useState<string | null>(null)

  const importMutation = useMutation({
    mutationFn: (employees: ImportEmployeeRow[]) => onboardingApi.importEmployees({ employees }),
    onSuccess: result => {
      toast({ title: `Imported ${result.imported} employee(s)`, description: 'Departments were created on first sight.' })
      void queryClient.invalidateQueries()
      onOpenChange(false)
      setRaw('')
      navigate('/hr/employees', { replace: true })
    },
    onError: error => toast({
      variant: 'error',
      title: 'Could not import',
      description: error instanceof ApiError ? error.message : 'Try again.',
    }),
  })

  function submit() {
    setParseError(null)
    try {
      const parsed = JSON.parse(raw) as ImportEmployeeRow[]
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setParseError('Paste a JSON array of at least one employee row.')
        return
      }
      importMutation.mutate(parsed)
    } catch {
      setParseError('That is not valid JSON.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import employees</DialogTitle>
          <DialogDescription>
            Paste a JSON array of rows:{' '}
            <code className="text-xs">
              {`[{ "name": "…", "title": "…", "department": "…", "salary": "84000" }]`}
            </code>
            . Salary is a major-unit decimal string; departments are created on first sight.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={raw}
          onChange={event => setRaw(event.target.value)}
          rows={8}
          spellCheck={false}
          className="w-full rounded-[var(--radius-input)] border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] p-3 font-mono text-xs text-[var(--color-body)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          placeholder='[{"name":"Ada Lovelace","title":"Engineer","department":"Engineering","salary":"84000"}]'
        />
        {parseError && <p role="alert" className="text-sm text-[var(--color-danger-text)]">{parseError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={raw.trim().length === 0 || importMutation.isPending} onClick={submit}>
            {importMutation.isPending ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
