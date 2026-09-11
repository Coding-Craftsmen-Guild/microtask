'use client'

import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { SAFE_HREF_SCHEMES } from '@repo/contracts'
import { PromptDialog } from '@repo/ui/shell/prompt-dialog'
import { normalizeHref } from './safe-href'

/** What the dialog says when it refuses an href, naming the schemes the contracts allow. */
export const LINK_REFUSED = `Only ${SAFE_HREF_SCHEMES.slice(0, -1).join(', ')} or ${
  SAFE_HREF_SCHEMES.at(-1) ?? ''
} links are allowed.`

const HINT = 'Leave empty to remove the link.'

/** Props for {@link LinkDialog}. */
export interface LinkDialogProps {
  /** The editor whose selection is linked, or `null` before one exists. */
  editor: Editor | null

  /** Whether the dialog is showing. */
  open: boolean

  /** Called once the dialog is done, applied or cancelled. Not called on a refusal. */
  onClose: () => void
}

/**
 * Legacy's Add/Edit link prompt, with the refusal legacy did not have.
 *
 * What was typed goes through {@link normalizeHref} **before** any command runs, so a
 * `javascript:` URL in any of its disguises never becomes a mark, never reaches autosave, and
 * never reaches the server guard that would reject it too (ADR 0029). A refusal keeps the
 * dialog open with the field as typed and says what is allowed; closing it would leave the
 * user wondering whether the link took.
 *
 * The empty string is not a refusal: it removes the link, over the whole mark via
 * `extendMarkRange`, so a bare caret inside a link is enough to retarget or remove all of it.
 */
export function LinkDialog({ editor, open, onClose }: LinkDialogProps) {
  const [refused, setRefused] = useState(false)
  const current = String(editor?.getAttributes('link')['href'] ?? '')
  const close = (): void => {
    setRefused(false)
    onClose()
  }
  const submit = (value: string): void => {
    const href = value === '' ? '' : normalizeHref(value)
    if (href === null) {
      setRefused(true)
      return
    }
    const chain = editor?.chain().focus().extendMarkRange('link')
    if (href === '') chain?.unsetLink().run()
    else chain?.setLink({ href }).run()
    close()
  }
  return (
    <PromptDialog
      allowEmpty
      defaultValue={current}
      hint={refused ? LINK_REFUSED : HINT}
      onCancel={close}
      onSubmit={submit}
      open={open}
      placeholder="https://example.com"
      submitLabel="Apply"
      title={current === '' ? 'Add link' : 'Edit link'}
    />
  )
}
