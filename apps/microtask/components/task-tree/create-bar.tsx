'use client'

import { Button } from '@repo/ui/components/button'
import { PromptDialog } from '@repo/ui/shell/prompt-dialog'
import { useState } from 'react'
import { NewTaskPrompt } from './new-task-prompt'
import { useTree } from './tree-context'

/**
 * `+ Task` and `+ Folder`, each drawn only where `controls` says the write would be accepted.
 *
 * A task created here lands at the project root; a folder's own menu creates inside it.
 */
export function CreateBar() {
  const { projectId, controls, actions, run } = useTree()
  const [asking, setAsking] = useState<'task' | 'folder' | null>(null)
  const close = () => setAsking(null)
  const createFolder = (name: string) => {
    close()
    void run(() => actions.createFolder(projectId, name))
  }
  return (
    <>
      {controls.createTask ? (
        <Button onClick={() => setAsking('task')} type="button" variant="outline">
          + Task
        </Button>
      ) : null}
      {controls.createFolder ? (
        <Button onClick={() => setAsking('folder')} type="button" variant="outline">
          + Folder
        </Button>
      ) : null}
      <NewTaskPrompt folderId={null} onClose={close} open={asking === 'task'} />
      <PromptDialog
        label="New folder name"
        onCancel={close}
        onSubmit={createFolder}
        open={asking === 'folder'}
        placeholder="e.g. ACME"
        submitLabel="Create folder"
        title="New folder"
      />
    </>
  )
}
