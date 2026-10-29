import { Building2, Check, Database, Loader2, Rocket, Settings2 } from 'lucide-react'

const STAGES = [
  { label: 'Workspace', detail: 'Create or activate the workspace', icon: Building2 },
  { label: 'Settings', detail: 'Save currency, timezone, and plan', icon: Settings2 },
  { label: 'Data', detail: 'Prepare the selected start mode', icon: Database },
  { label: 'Ready', detail: 'Open your dashboard', icon: Rocket },
]

/** Explicit stage indexes so the progress panel never has to guess from copy text. */
export const LAUNCH_STAGE = {
  WORKSPACE: 0,
  SETTINGS: 1,
  DATA: 2,
  READY: 3,
  COMPLETE: 4,
}

// Fallback for callers that only pass a message (and for older tests).
function activeStage(message) {
  if (/dashboard/i.test(message)) return LAUNCH_STAGE.READY
  if (/sample|import|migration|preparing/i.test(message)) return LAUNCH_STAGE.DATA
  if (/settings|currency|free plan/i.test(message)) return LAUNCH_STAGE.SETTINGS
  return LAUNCH_STAGE.WORKSPACE
}

export default function OnboardingLaunchProgress({ message, dataMode, stage }) {
  const active = Number.isInteger(stage)
    ? Math.min(Math.max(stage, LAUNCH_STAGE.WORKSPACE), STAGES.length)
    : activeStage(message)
  const complete = active >= STAGES.length

  return (
    <div data-testid="onboarding-launch-progress" role="status" aria-live="polite" className="flex min-h-[420px] flex-1 flex-col justify-center py-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="text-center">
          <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] border shadow-card ${
            complete
              ? 'border-success-border bg-success-light text-success-text'
              : 'border-white bg-white/70 text-primary'
          }`}>
            {complete ? <Check size={22} /> : <Loader2 size={22} className="animate-spin" />}
          </span>
          <p className={`mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] ${complete ? 'text-success-text' : 'text-accent'}`}>
            {complete ? 'Setup complete' : 'Setting things up'}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-heading">
            {complete ? 'Your workspace is ready' : message || 'Configuring your workspace...'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-body-light">
            {complete
              ? 'Taking you to your dashboard now.'
              : 'Keep this tab open. We are preparing the workspace and will take you to the dashboard as soon as it is ready.'}
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-black/[0.06] bg-white/55 p-2">
          {STAGES.map((stage, index) => {
            const Icon = stage.icon
            const done = complete || index < active
            const current = !complete && index === active
            return (
              <div
                key={stage.label}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 ${current ? 'bg-white/70' : ''}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                  done
                    ? 'border-success-border bg-success-light text-success-text'
                    : current
                      ? 'border-primary/20 bg-primary-light text-primary'
                      : 'border-black/[0.06] bg-white/40 text-caption'
                }`}>
                  {done ? <Check size={14} /> : current ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-xs font-semibold ${current ? 'text-heading' : done ? 'text-body' : 'text-caption'}`}>{stage.label}</span>
                  <span className="mt-0.5 block text-[10px] text-muted">{stage.detail}</span>
                </span>
                <span className={`text-[9px] font-semibold uppercase tracking-[0.1em] ${done ? 'text-success-text' : current ? 'text-primary' : 'text-caption'}`}>
                  {done ? 'Done' : current ? 'In progress' : 'Waiting'}
                </span>
              </div>
            )
          })}
        </div>

        {!complete && dataMode === 'sample' && (
          <p className="mt-4 rounded-xl border border-accent/10 bg-accent-light/60 px-3 py-2.5 text-center text-[10px] leading-5 text-ink-indigo">
            Loading the sample workspace can take a few minutes because finance, people, customer, project, and inventory records are prepared together.
          </p>
        )}
      </div>
    </div>
  )
}
