import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

interface LegacyPageFrameProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  search?: string
  onSearchChange?: (value: string) => void
  children: ReactNode
}

export function LegacyPageFrame({ title, subtitle, actions, search, onSearchChange, children }: LegacyPageFrameProps) {
  return (
    <div className="legacy-page min-w-[1000px] bg-[var(--color-surface)]">
      <div className="legacy-page-toolbar flex items-center justify-between gap-4 border-b border-[var(--color-border-default)] bg-[var(--color-surface-raised)] px-6 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-[var(--color-heading)]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {search !== undefined && onSearchChange && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-caption)]" />
              <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search..." className="h-8 w-56 rounded-[var(--radius-input)] border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] pl-9 pr-3 text-sm text-[var(--color-body)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
            </div>
          )}
          {actions}
        </div>
      </div>
      <div className="legacy-page-content space-y-6 overflow-y-auto p-6">{children}</div>
    </div>
  )
}

export function LegacyMetricCard({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail?: string; tone?: 'neutral' | 'success' | 'danger' | 'info' }) {
  const toneClass = tone === 'success' ? 'text-[var(--color-success-text)] bg-[var(--color-success-light)]' : tone === 'danger' ? 'text-[var(--color-danger-text)] bg-[var(--color-danger-light)]' : tone === 'info' ? 'text-[var(--color-info)] bg-[var(--color-info-light)]' : 'text-[var(--color-body-light)] bg-[var(--color-surface-muted)]'
  return <div className="rounded-[var(--radius-card-sm)] border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] p-5 shadow-[var(--shadow-card)]"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">{label}</p><div className="flex items-baseline justify-between gap-3"><p className="text-3xl font-bold tracking-tight text-[var(--color-heading)]">{value}</p>{detail && <span className={`rounded-[var(--radius-input)] px-2 py-0.5 text-xs font-bold ${toneClass}`}>{detail}</span>}</div></div>
}
