'use client'

import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { useState } from 'react'
import { OptionsMenu, type MenuEntry } from './options-menu'
import { groupIds, useTree, type TreeState } from './tree-context'
import { moved } from '../shared/moved'
import type { RowTask } from './types'

/**
 * What deleting a task takes with it, said before it is chosen.
 *
 * It does not claim the task's share links go too: the API leaves a task-scoped link in the
 * manifest when its task is deleted, so the promise would be false.
 */
export const DELETE_TASK_MESSAGE = 'All of its tabs and their content are deleted. This cannot be undone.'

const stepsFor = (tree: TreeState, task: RowTask): MenuEntry[] => {
  const order = groupIds(tree.tasks, task.folderId)
  const step = (label: string, delta: -1 | 1): MenuEntry => {
    const next = moved(order, task.id, delta)
    return {
      label,
      disabled: next === null,
      onSelect: () => {
        if (next !== null) void tree.run(() => tree.actions.reorderTasks(tree.projectId, task.folderId, next))
      },
    }
  }
  return tree.controls.reorderTasks ? [step('Move up', -1), step('Move down', 1)] : []
}

const movesFor = (tree: TreeState, task: RowTask): MenuEntry[] => {
  if (!tree.controls.moveTask) return []
  const targets = [...tree.folders, { id: null, name: 'No folder' }].filter((one) => one.id !== task.folderId)
  return targets.map((target) => ({
    label: `Move to ${target.name}`,
    onSelect: () => void tree.run(() => tree.actions.moveTask(tree.projectId, task.id, target.id)),
  }))
}

/**
 * A task's options: rename, a step up or down within its folder, a move to another folder, and
 * delete — each drawn only where `controls` allows it.
 */
export function TaskMenu({ task, onRename }: { task: RowTask; onRename: () => void }) {
  const tree = useTree()
  const [deleting, setDeleting] = useState(false)
  const remove = () => {
    setDeleting(false)
    void tree.run(() => tree.actions.deleteTask(tree.projectId, task.id))
  }
  const items: MenuEntry[] = [
    ...(tree.controls.renameTask ? [{ label: 'Rename', onSelect: onRename }] : []),
    ...stepsFor(tree, task),
    ...movesFor(tree, task),
    ...(tree.controls.deleteTask ? [{ label: 'Delete task', danger: true, onSelect: () => setDeleting(true) }] : []),
  ]
  return (
    <>
      <OptionsMenu items={items} label="Task options" />
      <ConfirmDialog
        confirmLabel="Delete task"
        danger
        message={DELETE_TASK_MESSAGE}
        onCancel={() => setDeleting(false)}
        onConfirm={remove}
        open={deleting}
        title={`Delete “${task.name}”?`}
      />
    </>
  )
}
