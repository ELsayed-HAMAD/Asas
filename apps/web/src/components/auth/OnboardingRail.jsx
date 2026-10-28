import {
  Check,
  LayoutGrid,
  Rocket,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

const STEPS = [
  { id: 1, label: 'Profile', detail: 'Company and locale', icon: UserRound },
  { id: 2, label: 'Areas', detail: 'What is included', icon: LayoutGrid },
  { id: 3, label: 'Start', detail: 'Prepare your workspace', icon: Rocket },
]

function SummaryRow({ label, value, muted = false }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-black/[0.05] py-1.5 last:border-b-0">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.09em] text-[#929297]">{label}</span>
      <span className={`min-w-0 break-words text-right text-xs font-medium leading-5 ${muted ? 'text-[#929297]' : 'text-[#2c2c2f]'}`}>{value}</span>
    </div>
  )
}

export function OnboardingProgress({ step, onStepSelect }) {
  return (
    <div data-testid="onboarding-mobile-progress" className="lg:hidden">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#929297]">Workspace setup</p>
        <span className="text-[10px] font-semibold text-[#312e81]">Step {step} of 3</span>
      </div>
      <ol className="grid grid-cols-3 gap-1.5" aria-label="Workspace setup progress">
        {STEPS.map((item) => {
          const complete = step > item.id
          const active = step === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                disabled={item.id >= step}
                onClick={() => onStepSelect(item.id)}
                className={`w-full rounded-xl border px-2 py-2 text-left transition-colors ${
                  active
                    ? 'border-[#1e1b4b] bg-[#1e1b4b] text-white'
                    : complete
                      ? 'border-[#1e1b4b]/15 bg-[#eef2ff] text-[#312e81]'
                      : 'border-black/[0.06] bg-white/45 text-[#929297]'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[10px] font-semibold">
                  {complete ? <Check size={10} /> : <span className="font-mono text-[9px]">{item.id}</span>}
                  {item.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function OnboardingRail({
  step,
  onStepSelect,
  workspaceName,
  currency,
  timezoneLabel,
  areaCount,
  startModeLabel,
  migrationScopeLabel,
}) {
  return (
    <aside className="hidden min-h-0 lg:flex lg:flex-col">
      <div className="glass-strong flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[28px] border border-border-default/70 p-4 shadow-glass xl:p-5">
        <div>
          <h2 className="text-xl font-semibold leading-[1.14] tracking-[-0.035em] text-heading">
            Build your operating workspace.
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-body-light">Three short steps, then your team can begin.</p>
        </div>

        <ol className="relative mt-4 space-y-0.5" aria-label="Workspace setup progress">
          <span className="absolute bottom-4 left-[15px] top-4 w-px bg-black/[0.07]" aria-hidden="true" />
          {STEPS.map((item) => {
            const Icon = item.icon
            const complete = step > item.id
            const active = step === item.id
            return (
              <li key={item.id} className="relative">
                <button
                  type="button"
                  aria-current={active ? 'step' : undefined}
                  disabled={item.id >= step}
                  onClick={() => onStepSelect(item.id)}
                  className={`group flex w-full items-start gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors ${
                    active ? 'bg-white/60' : complete ? 'hover:bg-white/40' : 'cursor-default'
                  }`}
                >
                  <span
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                      active
                        ? 'border-primary bg-primary text-on-primary shadow-card'
                        : complete
                          ? 'border-success-border bg-success-light text-success-text'
                          : 'border-border-default bg-surface-muted text-muted'
                    }`}
                  >
                    {complete ? <Check size={13} /> : <Icon size={14} />}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className={`block text-xs font-semibold ${active ? 'text-heading' : complete ? 'text-body' : 'text-caption'}`}>
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted">{item.detail}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div data-testid="onboarding-summary" className="mt-4 rounded-2xl border border-black/[0.06] bg-white/50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-light text-primary"><LayoutGrid size={12} /></span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#929297]">Setup summary</p>
          </div>
          <SummaryRow label="Workspace" value={workspaceName || 'Not named yet'} muted={!workspaceName} />
          <SummaryRow label="Currency" value={currency} />
          <SummaryRow label="Timezone" value={timezoneLabel} />
          <SummaryRow label="Areas" value={`All ${areaCount} included`} />
          <SummaryRow label="Start" value={startModeLabel} />
          {migrationScopeLabel && <SummaryRow label="Migration" value={migrationScopeLabel} />}
        </div>

        <div className="mt-auto pt-4 [@media(max-height:700px)]:hidden">
          <div className="flex items-start gap-2 rounded-2xl bg-[#eef2ff]/70 p-2.5 text-[10px] leading-5 text-[#4f4b7a]">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <span>Workspace roles, tenant isolation, and audit history stay active from the first sign-in.</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
