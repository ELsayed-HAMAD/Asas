import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Form dialog for create/edit flows (the new-feature surface of Phase 4). Shares the same
 * surface language as ConfirmDialog (rounded-card, shadow-elevated, the token palette) so a
 * "New Deal" / "New Candidate" / "New Product" / "New Payroll Run" dialog all read as the same
 * component family. The page renders the fields inside; this handles the chrome, backdrop,
 * Escape-to-close, body scroll lock, and the busy submit state.
 *
 * Usage:
 *   <FormDialog
 *     open={open}
 *     onClose={close}
 *     title="New deal"
 *     confirmLabel="Create deal"
 *     busy={mutation.isPending}
 *     onConfirm={submit}
 *     width="max-w-lg"
 *   >
 *     ...fields...
 *   </FormDialog>
 */
export default function FormDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  width = 'max-w-lg',
}) {
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
            aria-labelledby="form-dialog-title"
            className={`relative w-full ${width} bg-surface-raised rounded-card border border-border-default shadow-elevated flex flex-col max-h-[85vh]`}
          >
            <div className="px-6 pt-6 pb-4 flex-shrink-0">
              <h2 id="form-dialog-title" className="text-lg font-bold text-heading">
                {title}
              </h2>
              {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
            </div>

            <div className="px-6 pb-6 overflow-y-auto no-scrollbar">{children}</div>

            <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-3 flex-shrink-0">
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
                className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-button text-sm font-semibold hover:bg-primary-hover transition-colors active:scale-[0.99] disabled:opacity-60"
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
