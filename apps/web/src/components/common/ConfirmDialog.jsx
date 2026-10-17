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
 * Confirmation dialog for destructive actions. Styled with the same design tokens
 * as the rest of the app (rounded-card, shadow-elevated, danger accents for destructive use).
 */
export default function ConfirmDialog({
  open,
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  danger = false,
  error,
}) {
  const isDialogOpen = Boolean(open ?? isOpen)

  return (
    <Dialog open={isDialogOpen} onOpenChange={(val) => { if (!val && !busy) onClose?.() }}>
      <DialogContent className="relative w-full max-w-md bg-surface-raised rounded-card border border-border-default shadow-elevated p-6">
        <DialogHeader className="text-left rtl:text-right">
          <DialogTitle id="confirm-dialog-title" className="text-lg font-bold text-heading">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted leading-relaxed mt-1.5">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="my-2 py-2 px-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="mt-4 flex items-center justify-end gap-3 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
