'use client'

import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { useState } from 'react'
import { NewTaskPrompt } from './new-task-prompt'
import { OptionsMenu, type MenuEntry } from './options-menu'
import { useTree, type TreeState } from './tree-context'
import { moved } from '../shared/moved'
import type { RowFolder } from './types'

/** What deleting a folder does to its tasks, said before it is chosen. */
export const DELETE_FOLDER_MESSAGE = 'Its tasks are kept and move to the top level of this project.'

type Opened = 'task' | 'delete' | null

const itemsFor = (tree: TreeState, folder: RowFolder, open: (which: Opened) => void): MenuEntry[] => {
  const { projectId, folders, controls, actions, run } = tree
  const ids = [...folders].sort((a, b) => a.position - b.position).map((one) => one.id)
  const step = (id: string, label: string, delta: -1 | 1): MenuEntry => {
    const order = moved(ids, folder.id, delta)
    return {
      id,
      label,
      disabled: order === null,
      onSelect: () => {
        if (order !== null) void run(() => actions.reorderFolders(projectId, order))
      },
    }
  }
  return [
    ...(controls.createTask ? [{ id: 'task', label: 'New task in this folder', onSelect: () => open('task') }] : []),
    ...(controls.reorderFolders ? [step('up', 'Move up', -1), step('down', 'Move down', 1)] : []),
    ...(controls.deleteFolder ? [{ id: 'delete', label: 'Delete folder', danger: true, onSelect: () => open('delete') }] : []),
  ]
}

/**
 * A folder's options: a task created inside it, a step up or down, and delete.
 *
 * A step is sent as the whole folder order, computed from every folder rather than from what the
 * search left visible, because the route refuses anything but a strict permutation.
 */
export function FolderMenu({ folder }: { folder: RowFolder }) {
  const tree = useTree()
  const [opened, open] = useState<Opened>(null)
  const close = () => open(null)
  const remove = () => {
    close()
    void tree.run(() => tree.actions.deleteFolder(tree.projectId, folder.id))
  }
  return (
    <>
      <OptionsMenu items={itemsFor(tree, folder, open)} label="Folder options" />
      <NewTaskPrompt folderId={folder.id} onClose={close} open={opened === 'task'} />
      <ConfirmDialog
        confirmLabel="Delete folder"
        danger
        message={DELETE_FOLDER_MESSAGE}
        onCancel={close}
        onConfirm={remove}
        open={opened === 'delete'}
        title={`Delete “${folder.name}”?`}
      />
    </>
  )
}
