'use client'

import { PromptDialog } from '@repo/ui/shell/prompt-dialog'
import { useTree } from './tree-context'

/** Props for {@link NewTaskPrompt}. */
export interface NewTaskPromptProps {
  /** Whether the prompt is open. */
  open: boolean
  /** The folder to create in, or `null` for the project root. */
  folderId: string | null
  /** Closes the prompt, whatever was chosen. */
  onClose: () => void
}

/**
 * Asks for a task name and creates the task, which then opens: creating what the app being
 * replaced called a project opened it too. Only a refusal stays on this page, as the tree's
 * problem line.
 */
export function NewTaskPrompt({ open, folderId, onClose }: NewTaskPromptProps) {
  const { projectId, actions, run } = useTree()
  const create = (name: string) => {
    onClose()
    void run(async () => (await actions.createTask(projectId, name, folderId)) ?? { ok: true, value: null })
  }
  return (
    <PromptDialog
      label="New task name"
      onCancel={onClose}
      onSubmit={create}
      open={open}
      placeholder="e.g. DNS cutover"
      submitLabel="Create task"
      title="New task"
    />
  )
}
