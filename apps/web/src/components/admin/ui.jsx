import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

export function AdminPageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-heading sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function AdminKpiCard({ label, value, detail, icon: Icon, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-[#1e1b4b] text-white',
    emerald: 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-700 border border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-700 border border-rose-500/20',
    slate: 'bg-surface-muted text-body border border-border-default',
  }
  return (
    <div className="rounded-[22px] border border-white/80 bg-white/70 p-4 shadow-[0_10px_35px_-18px_rgba(15,23,42,0.25)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', tones[tone] ?? tones.indigo)}>
            <Icon size={15} />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-heading tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-[11px] leading-5 text-muted">{detail}</p>}
    </div>
  )
}

export function AdminStatusBadge({ status }) {
  const normalized = String(status || '').toUpperCase()
  const tone =
    normalized === 'ACTIVE' || normalized === 'OK' || normalized === 'CONNECTED' || normalized === 'DONE' || normalized === 'ON' || normalized === 'OWNER'
      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
      : normalized === 'SUSPENDED' || normalized === 'PAST_DUE' || normalized === 'FAILED'
        ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
        : normalized === 'QUEUED' || normalized === 'RUNNING' || normalized === 'PENDING' || normalized === 'ADMIN'
          ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
          : normalized === 'MEMBER' || normalized === 'OFF'
            ? 'bg-surface-muted text-body border-border-default'
            : 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20'
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', tone)}>
      {status || 'Unknown'}
    </span>
  )
}

export function AdminPagination({ pagination, onPage, busy = false }) {
  if (!pagination || pagination.pages <= 1) return null
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-3 text-xs text-muted">
      <span>
        Page {pagination.page} of {pagination.pages} · {pagination.total.toLocaleString()} records
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || pagination.page <= 1}
          onClick={() => onPage(pagination.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || pagination.page >= pagination.pages}
          onClick={() => onPage(pagination.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}

export function AdminEmptyState({ title, description, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-border-default bg-white/50 px-6 py-14 text-center">
      {Icon && <Icon size={30} className="mb-3 text-muted/50" />}
      <p className="text-sm font-semibold text-heading">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs leading-5 text-muted">{description}</p>}
    </div>
  )
}

export function AdminLoading({ label = 'Loading platform data...' }) {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-muted">
      <Loader2 size={22} className="animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function AdminError({ message, onRetry }) {
  return (
    <div className="rounded-[22px] border border-rose-200 bg-rose-50/80 p-5 text-sm text-rose-800">
      <p className="font-semibold">The platform data could not be loaded.</p>
      <p className="mt-1 text-xs leading-5">{message || 'Check the API connection and try again.'}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
