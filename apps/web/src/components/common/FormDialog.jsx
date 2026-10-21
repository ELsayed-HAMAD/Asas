import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Alert, AlertDescription } from '../ui/alert'

/**
 * Form dialog for create/edit flows. Shares the same surface language as ConfirmDialog
 * (rounded-card, shadow-elevated, the token palette). The page renders the fields inside;
 * this handles the chrome, backdrop, Escape-to-close, body scroll lock, and the busy submit state.
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
  const isDialogOpen = Boolean(open ?? isOpen)
  const returnFocusTo = useRef(null)

  // Native form submit: Enter in a field and the submit button both land here. We prevent the
  // browser's default navigation and delegate to the page's handler, but never while busy.
  function handleSubmit(event) {
    event.preventDefault()
    if (!busy && !disabled && !isConfirmDisabled) onConfirm?.()
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={(val) => { if (!val && !busy) onClose?.() }}>
      <DialogContent
        className={`w-full ${width} bg-surface-raised rounded-card border border-border-default shadow-elevated p-0 flex flex-col max-h-[85vh] overflow-hidden`}
        onOpenAutoFocus={() => {
          returnFocusTo.current = document.activeElement
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocusTo.current?.isConnected) {
            event.preventDefault()
            returnFocusTo.current.focus()
          }
          returnFocusTo.current = null
        }}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0 text-left rtl:text-right">
            <DialogTitle id="form-dialog-title" className="text-lg font-bold text-heading">
              {title}
            </DialogTitle>
            {subtitle && (
              <DialogDescription className="text-sm text-muted mt-0.5">
                {subtitle}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="px-6 pb-6 overflow-y-auto no-scrollbar flex-1">{children}</div>

          {error && (
            <div className="px-6 pb-4 flex-shrink-0">
              <Alert variant="destructive" className="py-2 px-3">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-3 flex-shrink-0 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={confirmVariant === 'danger' ? 'destructive' : 'default'}
              disabled={busy || disabled || isConfirmDisabled}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
