import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Database, FileUp, Loader2, Sparkles, SquarePen } from 'lucide-react'
import { http } from '../../lib/api/http'
import { useActiveOrganization, useSession, authClient } from '../../lib/authClient'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/textarea'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group'

// The three start paths — the legacy UX, kept verbatim. The API endpoints are the
// preserved 3-path onboarding flow under `/api/v1/onboarding` (see the API's
// onboarding.routes.ts); the sample pack is now seeded from `apps/api/seeds/onboarding/`.
const CHOICES = [
  {
    id: 'empty',
    title: 'Start empty',
    description: 'Enter your workspace with no sample data. Add employees and records yourself.',
    icon: SquarePen,
  },
  {
    id: 'sample',
    title: 'Load Enterprise Dataset',
    description: 'Populate the workspace with a comprehensive enterprise dataset (HR, CRM, Finance, Projects, Inventory) to explore all dashboards instantly.',
    icon: Sparkles,
  },
  {
    id: 'import',
    title: 'Upload employee data',
    description: 'Paste a JSON list of employees to import into this workspace.',
    icon: FileUp,
  },
]

const EXAMPLE_IMPORT = `{
  "employees": [
    {
      "name": "Ada Lovelace",
      "title": "Engineer",
      "department": "Engineering",
      "status": "ACTIVE",
      "email": "ada@example.com"
    }
  ]
}`

export default function Onboarding() {
  const { data: activeOrganization } = useActiveOrganization()
  const { data: session } = useSession()
  const [selected, setSelected] = useState('sample')
  const [importJson, setImportJson] = useState(EXAMPLE_IMPORT)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  if (activeOrganization && activeOrganization.onboardingStatus !== 'PENDING') {
    return <Navigate to="/dashboard" replace />
  }

  const finish = async () => {
    setError('')
    setIsLoading(true)
    try {
      let currentOrgId = activeOrganization?.id || session?.session?.activeOrganizationId

      if (!currentOrgId) {
        const workspaceName = session?.user?.name || 'My Workspace'
        const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `org-${Date.now()}`
        
        let createRes = await authClient.organization.create({
          name: workspaceName,
          slug,
        })

        if (createRes?.error && /already exists/i.test(createRes.error.message || '')) {
          const uniqueSlug = `${slug}-${Math.random().toString(36).substring(2, 6)}`
          createRes = await authClient.organization.create({
            name: workspaceName,
            slug: uniqueSlug,
          })
        }

        if (createRes?.error || !createRes?.data?.id) {
          throw new Error(createRes?.error?.message || 'Could not create workspace.')
        }

        currentOrgId = createRes.data.id
        await authClient.organization.setActive({ organizationId: currentOrgId })
      } else if (!activeOrganization?.id) {
        await authClient.organization.setActive({ organizationId: currentOrgId })
      }

      if (selected === 'empty') {
        await http.post('/onboarding/empty', { body: {} })
      } else if (selected === 'sample') {
        await http.post('/onboarding/sample', { body: {} })
      } else {
        let payload
        try {
          payload = JSON.parse(importJson)
        } catch {
          throw new Error('Import JSON is not valid.')
        }
        await http.post('/onboarding/import', { body: payload })
      }
      
      // Force a hard reload so the auth client refetches the session and sees the new onboardingStatus
      window.location.href = '/dashboard'
    } catch (requestError) {
      const message = requestError?.message ?? 'Unable to complete onboarding.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-muted flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-surface-raised border border-border-default rounded-button p-8 shadow-card">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">Onboarding</p>
          <h1 className="text-2xl font-semibold text-heading mb-2">How do you want to start?</h1>
          <p className="text-sm text-muted">
            Sample data is optional and separate from the product. You can run Asas with an empty workspace.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <RadioGroup value={selected} onValueChange={setSelected} className="space-y-3 mb-6 gap-0">
          {CHOICES.map(choice => {
            const Icon = choice.icon
            const active = selected === choice.id
            return (
              <label
                key={choice.id}
                htmlFor={`choice-${choice.id}`}
                className={`w-full text-left flex gap-4 p-4 rounded-button border transition-colors cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                  active
                    ? 'border-accent bg-surface-active'
                    : 'border-border-default hover:bg-surface-muted'
                }`}
              >
                <RadioGroupItem
                  value={choice.id}
                  id={`choice-${choice.id}`}
                  className="sr-only"
                />
                <div className="w-10 h-10 rounded-button bg-surface-strong flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-heading" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-heading">{choice.title}</p>
                  <p className="text-sm text-muted mt-0.5">{choice.description}</p>
                </div>
              </label>
            )
          })}
        </RadioGroup>

        {selected === 'import' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-body mb-1.5" htmlFor="import-json">
              Employees JSON
            </label>
            <Textarea
              id="import-json"
              value={importJson}
              onChange={event => setImportJson(event.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
          </div>
        )}

        {selected === 'sample' && (
          <div className="mb-6 flex items-start gap-2 text-sm text-muted">
            <Database size={16} className="mt-0.5 flex-shrink-0" />
            <p>
              Loads the enterprise sample pack into your tenant only. It can be removed again
              from <span className="text-heading font-medium">Settings → Data</span> whenever you
              are ready to enter your own data.
            </p>
          </div>
        )}

        <Button
          type="button"
          disabled={isLoading}
          onClick={finish}
          className="w-full h-10 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>{selected === 'sample' ? 'Setting up workspace & seeding enterprise data...' : 'Setting up workspace...'}</span>
            </>
          ) : (
            'Continue to dashboard'
          )}
        </Button>
      </div>
    </div>
  )
}
