'use client'

import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { PromptDialog } from '@repo/ui/shell/prompt-dialog'
import type { WorkspaceTab } from './workspace-state'

/** Which of the three tab dialogs is open, and for which tab. */
export type TabDialog =
  | { readonly kind: 'create' }
  | { readonly kind: 'rename'; readonly tab: WorkspaceTab }
  | { readonly kind: 'delete'; readonly tab: WorkspaceTab }

/** Props for {@link TabDialogs}. */
export interface TabDialogsProps {
  /** The open dialog, or `null`. */
  dialog: TabDialog | null
  /** Closes whichever dialog is open. */
  onClose: () => void
  /** Creates a tab with the name given. */
  onCreate: (name: string) => void
  /** Renames a tab. */
  onRename: (tab: WorkspaceTab, name: string) => void
  /** Deletes a tab. */
  onDelete: (tab: WorkspaceTab) => void
}

/** The line a delete confirmation states, verbatim from legacy. */
export const DELETE_TAB_MESSAGE = 'Everything written in this tab is deleted. This cannot be undone.'

/**
 * Legacy's three tab dialogs, in its exact words: `New tab` (placeholder `Client tasks`, submit
 * `Create`), `Rename tab` (pre-filled and selected, submit `Rename`), and `Delete “<name>”?`.
 *
 * The prompts refuse an empty name, and the delete confirmation focuses nothing, so Enter cannot
 * delete a tab — only a click can. Both are the shared shell's behaviour, not this file's.
 */
export function TabDialogs({ dialog, onClose, onCreate, onRename, onDelete }: TabDialogsProps) {
  const kind = dialog === null ? null : dialog.kind
  const target = dialog === null || dialog.kind === 'create' ? null : dialog.tab
  const name = target === null ? '' : target.name
  const decide = (then: (tab: WorkspaceTab) => void) => () => {
    onClose()
    if (target !== null) then(target)
  }
  return (
    <>
      <PromptDialog
        label="Tab name"
        onCancel={onClose}
        onSubmit={(value) => {
          onClose()
          onCreate(value)
        }}
        open={kind === 'create'}
        placeholder="Client tasks"
        submitLabel="Create"
        title="New tab"
      />
      <PromptDialog
        defaultValue={name}
        label="Tab name"
        onCancel={onClose}
        onSubmit={(value) => decide((tab) => onRename(tab, value))()}
        open={kind === 'rename'}
        submitLabel="Rename"
        title="Rename tab"
      />
      <ConfirmDialog
        confirmLabel="Delete tab"
        danger
        message={DELETE_TAB_MESSAGE}
        onCancel={onClose}
        onConfirm={decide(onDelete)}
        open={kind === 'delete'}
        title={`Delete “${name}”?`}
      />
    </>
  )
}
