import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '../ui/alert-dialog'
import { Button } from '../ui/button'
import { Alert, AlertDescription } from '../ui/alert'

/**
 * Confirmation dialog. Non-destructive confirms render ui/dialog; destructive
 * confirms (danger) render ui/alert-dialog so screen readers announce them as
 * an alertdialog. Both branches share the same props, busy state and error
 * banner — only the wrapper primitive differs.
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

  const Root = danger ? AlertDialog : Dialog
  const Content = danger ? AlertDialogContent : DialogContent
  const Header = danger ? AlertDialogHeader : DialogHeader
  const Title = danger ? AlertDialogTitle : DialogTitle
  const Description = danger ? AlertDialogDescription : DialogDescription
  const Footer = danger ? AlertDialogFooter : DialogFooter

  return (
    <Root open={isDialogOpen} onOpenChange={(val) => { if (!val && !busy) onClose?.() }}>
      <Content className="w-full max-w-md bg-surface-raised rounded-card border border-border-default shadow-elevated p-6">
        <Header className="text-left rtl:text-right">
          <Title id="confirm-dialog-title" className="text-lg font-bold text-heading">
            {title}
          </Title>
          {description && (
            <Description className="text-sm text-muted leading-relaxed mt-1.5">
              {description}
            </Description>
          )}
        </Header>

        {error && (
          <Alert variant="destructive" className="my-2 py-2 px-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Footer className="mt-4 flex items-center justify-end gap-3 sm:space-x-0">
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
        </Footer>
      </Content>
    </Root>
  )
}