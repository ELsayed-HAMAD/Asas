import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Confirmation dialog for destructive actions. The legacy `common/ConfirmDialog.jsx` was a
 * 3-line "coming soon" stub — this is the real component, styled with the same design tokens
 * as the rest of the app (rounded-card, shadow-elevated, danger accents for destructive use).
 *
 * Usage:
 *   <ConfirmDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onConfirm={handleConfirm}
 *     title="Clear sample data?"
 *     description="This permanently removes the sample dataset…"
 *     confirmLabel="Clear data"
 *     busy={isPending}
 *     danger
 *   />
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  danger = false,
}) {
  // Close on Escape (when not busy) and lock background scroll while open.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, busy, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-overlay backdrop-blur-sm"
            onClick={() => !busy && onClose()}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="relative w-full max-w-md bg-surface-raised rounded-card border border-border-default shadow-elevated p-6"
          >
            <h2 id="confirm-dialog-title" className="text-lg font-bold text-heading mb-1.5">
              {title}
            </h2>
            {description && <p className="text-sm text-muted leading-relaxed mb-6">{description}</p>}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-button text-sm font-medium text-body border border-border-default hover:bg-surface-muted transition-colors disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className={`flex items-center gap-2 px-4 py-2 rounded-button text-sm font-semibold text-on-primary transition-colors active:scale-[0.99] disabled:opacity-60 ${
                  danger ? 'bg-danger-hover hover:bg-danger-text' : 'bg-primary hover:bg-primary-hover'
                }`}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
