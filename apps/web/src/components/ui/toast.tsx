import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A deliberately small, dependency-free toast system: `toast()` is a plain function any component
 * can call (no context to wire through a route tree), and `<Toaster />` is the single mount point
 * that renders what gets called. Events ride on `window` because the toast is cross-cutting — a
 * form in a settings page fires it, the page root renders it — and there is nothing to serialize
 * or share across tabs, so localStorage would only add a failure mode.
 */

export interface ToastInput {
  title: string
  description?: string
  variant?: 'success' | 'error' | 'info'
  durationMs?: number
}

/**
 * A `ToastInput` with its optional fields defaulted — the shape the event actually carries.
 * `variant` and `durationMs` are always present at this point (see `toast()`), which is what
 * lets `Toaster` build a `ToastItem` without re-defaulting.
 */
interface ResolvedToastInput {
  title: string
  description?: string
  variant: 'success' | 'error' | 'info'
  durationMs: number
}

interface ToastItem extends Required<Omit<ToastInput, 'description'>> {
  id: number
  description?: string
}

const TOAST_EVENT = 'asas:toast'
let nextId = 1

export function toast(input: ToastInput): void {
  window.dispatchEvent(
    new CustomEvent<ResolvedToastInput>(TOAST_EVENT, {
      detail: { variant: 'success', durationMs: 4000, ...input },
    }),
  )
}

const VARIANT_CLASSES: Record<NonNullable<ToastInput['variant']>, string> = {
  success: 'border-l-4 border-l-[var(--color-success)]',
  error: 'border-l-4 border-l-[var(--color-danger)]',
  info: 'border-l-4 border-l-[var(--color-accent)]',
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), item.durationMs)
    return () => clearTimeout(timer)
  }, [item.id, item.durationMs, onDismiss])

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] p-4 shadow-[var(--shadow-elevated)]',
        VARIANT_CLASSES[item.variant],
      )}
    >
      <div className="flex-1">
        <p className="text-sm font-semibold text-[var(--color-heading)]">{item.title}</p>
        {item.description !== undefined && (
          <p className="mt-1 text-xs text-[var(--color-muted)]">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-heading)]"
      >
        Dismiss
      </button>
    </div>
  )
}

/** Mount once per page (or per route element) that can fire toasts. */
export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  React.useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent<ResolvedToastInput>).detail
      setToasts(current => [...current, { id: nextId++, ...detail }])
    }
    window.addEventListener(TOAST_EVENT, handle)
    return () => window.removeEventListener(TOAST_EVENT, handle)
  }, [])

  const dismiss = React.useCallback((id: number) => {
    setToasts(current => current.filter(item => item.id !== id))
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(item => (
        <ToastCard key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>
  )
}
