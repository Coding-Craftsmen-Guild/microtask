'use client'

import { useId, useRef, type FormEvent } from 'react'
import { Button } from '../components/button'
import { Input } from '../components/input'
import { Label } from '../components/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog'
import { cancelWhenClosed, focusOnOpen } from './dismiss'

/** Props for {@link PromptDialog}. */
export interface PromptDialogProps {
  /** Whether the dialog is mounted and modal. */
  open: boolean
  /** The dialog heading, such as `Rename tab`. */
  title: string
  /** An optional explanatory line under the heading. */
  hint?: string
  /** An optional label for the field. The share page's New tab prompt has none. */
  label?: string
  /** The value the field opens with, pre-selected so retyping replaces it. */
  defaultValue?: string
  /** Placeholder shown when the field is empty. */
  placeholder?: string
  /** The submit button's label. Defaults to `Save`. */
  submitLabel?: string
  /** Whether the empty string is a valid answer, meaning "clear this name". */
  allowEmpty?: boolean
  /** Called with the trimmed value when the form is submitted. */
  onSubmit: (value: string) => void
  /** Called on Cancel, Escape, and any other dismissal. */
  onCancel: () => void
}

/**
 * A modal single-field prompt. On open the input is focused **and**
 * text-selected, so typing replaces the current name rather than appending to
 * it — legacy behaviour that makes renaming one gesture.
 *
 * The field is uncontrolled and reseeded from `defaultValue` every time the
 * dialog opens, so a cancelled edit leaves nothing behind. A value that trims
 * to empty is refused unless `allowEmpty`, which is how a share link's name is
 * deliberately cleared back to `Unnamed link`. The 200-character cap is
 * legacy's, above the 80 the server truncates to.
 */
export function PromptDialog(props: PromptDialogProps) {
  const { open, title, hint, label, defaultValue = '', allowEmpty = false } = props
  const input = useRef<HTMLInputElement>(null)
  const fieldId = useId()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = input.current?.value.trim() ?? ''
    if (next || allowEmpty) props.onSubmit(next)
  }
  return (
    <Dialog onOpenChange={cancelWhenClosed(props.onCancel)} open={open}>
      <DialogContent
        className="sm:max-w-[460px]"
        onOpenAutoFocus={focusOnOpen(() => input.current, true)}
        showCloseButton={false}
      >
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {hint ? <DialogDescription>{hint}</DialogDescription> : null}
            {label ? <Label htmlFor={fieldId}>{label}</Label> : null}
            <Input
              defaultValue={defaultValue}
              id={fieldId}
              maxLength={200}
              placeholder={props.placeholder ?? ''}
              ref={input}
              type="text"
            />
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button onClick={props.onCancel} type="button" variant="outline">
              Cancel
            </Button>
            <Button type="submit">{props.submitLabel ?? 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
