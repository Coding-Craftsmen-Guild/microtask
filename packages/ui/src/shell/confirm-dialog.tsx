'use client'

import { useRef } from 'react'
import { Button } from '../components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog'
import { cancelWhenClosed, focusOnOpen } from './dismiss'

/** Props for {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  /** Whether the dialog is mounted and modal. */
  open: boolean
  /** The question, with the subject's name quoted by the caller. */
  title: string
  /** What the action does, stated as a consequence. */
  message: string
  /** The confirm button's label. Defaults to `Confirm`. */
  confirmLabel?: string
  /** Whether the action destroys data, which changes both paint and focus. */
  danger?: boolean
  /** Called when the confirm button is clicked. */
  onConfirm: () => void
  /** Called on Cancel, Escape, and any other dismissal. */
  onCancel: () => void
}

/**
 * A modal confirm, reproducing legacy's deliberate asymmetry: a destructive
 * dialog focuses **nothing** actionable, so Enter cannot delete anything and a
 * click is the only way through, while a safe one focuses its confirm button so
 * Enter accepts it.
 *
 * In the destructive case focus lands on the dialog itself rather than being
 * left outside it, because focus left on the trigger would make Enter reopen
 * what it just opened.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const content = useRef<HTMLDivElement>(null)
  const confirm = useRef<HTMLButtonElement>(null)
  return (
    <Dialog onOpenChange={cancelWhenClosed(onCancel)} open={open}>
      <DialogContent
        className="sm:max-w-[460px]"
        onOpenAutoFocus={focusOnOpen(() => (danger ? content.current : confirm.current))}
        ref={content}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            ref={confirm}
            type="button"
            variant={danger ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
