import { Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import useDialogAccessibility from './useDialogAccessibility'

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
 *     error={mutation.isError ? mutation.error?.message : undefined}
 *     onConfirm={submit}
 *     width="max-w-lg"
 *   >
 *     ...fields...
 *   </FormDialog>
 *
 * The fields and the footer buttons are wrapped in a real `<form>` and the confirm button is a
 * submit button, so pressing Enter inside a field submits and native validation (`required`,
 * `type="email"`, `min`, …) actually runs — previously the button was `type="button"`, which
 * made `required` a no-op and swallowed Enter. `onConfirm` receives no arguments; it fires after
 * `event.preventDefault()` whenever the form submits and the dialog is not busy.
 */
export default function FormDialog({
  open,
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  busy = false,
  error,
  onConfirm,
  width = 'max-w-lg',
  disabled = false,
  isConfirmDisabled = false,
  confirmVariant = 'primary',
}) {
  const isDialogOpen = open ?? isOpen
  const dialogRef = useDialogAccessibility({ open: isDialogOpen, onClose, busy })

  // Native form submit: Enter in a field and the submit button both land here. We prevent the
  // browser's default navigation and delegate to the page's handler, but never while busy.
  function handleSubmit(event) {
    event.preventDefault()
    if (!busy && !disabled && !isConfirmDisabled) onConfirm?.()
  }

  return (
    <AnimatePresence>
      {isDialogOpen && (
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
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="form-dialog-title"
            className={`relative w-full ${width} bg-surface-raised rounded-card border border-border-default shadow-elevated flex flex-col max-h-[85vh]`}
          >
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="px-6 pt-6 pb-4 flex-shrink-0">
                <h2 id="form-dialog-title" className="text-lg font-bold text-heading">
                  {title}
                </h2>
                {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
              </div>

              <div className="px-6 pb-6 overflow-y-auto no-scrollbar">{children}</div>

              {error && (
                <div className="px-6 pb-4 flex-shrink-0">
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                </div>
              )}

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
                  type="submit"
                  disabled={busy || disabled || isConfirmDisabled}
                  className={`flex items-center gap-2 px-4 py-2 rounded-button text-sm font-semibold transition-colors active:scale-[0.99] disabled:opacity-60 ${
                    confirmVariant === 'danger'
                      ? 'bg-danger-hover hover:bg-danger-text text-on-primary'
                      : 'bg-primary text-on-primary hover:bg-primary-hover'
                  }`}
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  {confirmLabel}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
