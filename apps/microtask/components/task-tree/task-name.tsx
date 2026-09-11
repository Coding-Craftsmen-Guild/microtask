'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { taskPagePath } from '../projects/paths'
import { InlineName } from './inline-name'
import { useTree } from './tree-context'
import type { RowTask } from './types'

/** Props for {@link TaskName}. */
export interface TaskNameProps {
  /** The task. */
  task: RowTask
  /** Whether its name is being edited, which the row's menu decides. */
  renaming: boolean
  /** Ends the edit. */
  onDone: () => void
}

/**
 * A task's name: a link to it, or — while renaming — the same field the project title uses.
 *
 * The link shows the name the **server** answered the moment a rename succeeds, rather than
 * waiting for the page refresh, because the server's name can differ from what was typed.
 *
 * A refusal is said on the tree's line rather than under the field, because the field closes as
 * the edit ends and would take its own alert with it; so it is still said once.
 */
export function TaskName({ task, renaming, onDone }: TaskNameProps) {
  const { projectId, actions, report } = useTree()
  const [name, setName] = useState(task.name)
  useEffect(() => setName(task.name), [task.name])
  const rename = async (next: string) => {
    const result = await actions.renameTask(projectId, task.id, next)
    report(result)
    if (result.ok) setName(result.value)
    return result
  }
  if (renaming) {
    return <InlineName autoFocus className="font-semibold" label="Task name" name={name} onDone={onDone} onRename={rename} />
  }
  return (
    <Link className="font-semibold text-foreground no-underline" data-testid="task-name" href={taskPagePath(projectId, task.id)}>
      {name}
    </Link>
  )
}
