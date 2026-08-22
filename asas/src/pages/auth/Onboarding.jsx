import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, FileUp, Loader2, Sparkles, SquarePen } from 'lucide-react'
import { onboardingService } from '../../services/onboarding.service'
import { useAuthStore } from '../../store/authStore'

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
  const navigate = useNavigate()
  const [selected, setSelected] = useState('sample')
  const [importJson, setImportJson] = useState(EXAMPLE_IMPORT)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const finish = async () => {
    setError('')
    setIsLoading(true)
    try {
      if (selected === 'empty') {
        await onboardingService.markEmpty()
      } else if (selected === 'sample') {
        await onboardingService.applySample()
      } else {
        let payload
        try {
          payload = JSON.parse(importJson)
        } catch {
          throw new Error('Import JSON is not valid.')
        }
        await onboardingService.importEmployees(payload)
      }

      const user = useAuthStore.getState().user
      if (user) {
        const status =
          selected === 'empty' ? 'EMPTY' : selected === 'sample' ? 'SAMPLE_LOADED' : 'IMPORTED'
        useAuthStore.getState().updateUser({
          ...user,
          tenant: { ...user.tenant, onboardingStatus: status },
        })
      }
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(
        requestError.message?.includes('JSON')
          ? requestError.message
          : requestError.response?.data?.error?.message || 'Unable to complete onboarding.',
      )
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
          <div className="mb-4 px-3.5 py-2.5 bg-danger-light border border-danger-border rounded-button text-sm text-danger">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-6">
          {CHOICES.map(choice => {
            const Icon = choice.icon
            const active = selected === choice.id
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => setSelected(choice.id)}
                className={`w-full text-left flex gap-4 p-4 rounded-button border transition-colors ${
                  active
                    ? 'border-accent bg-surface-active'
                    : 'border-border-default hover:bg-surface-muted'
                }`}
              >
                <div className="w-10 h-10 rounded-button bg-surface-strong flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-heading" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-heading">{choice.title}</p>
                  <p className="text-sm text-muted mt-0.5">{choice.description}</p>
                </div>
              </button>
            )
          })}
        </div>

        {selected === 'import' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-body mb-1.5" htmlFor="import-json">
              Employees JSON
            </label>
            <textarea
              id="import-json"
              value={importJson}
              onChange={event => setImportJson(event.target.value)}
              rows={10}
              className="w-full px-3 py-2.5 text-xs font-mono border border-border-default rounded-button focus:outline-none focus:ring-4 focus:ring-surface-active bg-surface-muted"
            />
          </div>
        )}

        {selected === 'sample' && (
          <div className="mb-6 flex items-start gap-2 text-sm text-muted">
            <Database size={16} className="mt-0.5 flex-shrink-0" />
            <p>
              Loads the pack from <code className="text-xs">api/seeds/onboarding/hr.json</code> into your
              tenant only. Removing that folder does not break the platform.
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={isLoading}
          onClick={finish}
          className="w-full bg-primary text-on-primary text-sm font-medium py-2.5 rounded-button hover:bg-primary-hover disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Continue to dashboard'}
        </button>
      </div>
    </div>
  )
}
