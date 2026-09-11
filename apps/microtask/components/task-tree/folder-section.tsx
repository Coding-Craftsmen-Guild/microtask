'use client'

import { ProgressBar } from '@repo/ui/shell/progress-bar'
import { progressOf } from '../projects/summary'
import { FolderMenu } from './folder-menu'
import { InlineName } from './inline-name'
import { TaskRow } from './task-row'
import { useTree } from './tree-context'
import type { RowFolder, RowTask } from './types'

/** Props for {@link FolderSection}. */
export interface FolderSectionProps {
  /** The folder. */
  folder: RowFolder
  /** Its tasks, as far as the search leaves them. */
  tasks: readonly RowTask[]
}

/**
 * One folder: its name — edited in place where renaming is drawn — the sum of its tasks' cached
 * progress, its options, and its task rows.
 */
export function FolderSection({ folder, tasks }: FolderSectionProps) {
  const { projectId, controls, actions, report } = useTree()
  const progress = progressOf(tasks)
  const rename = async (name: string) => {
    const result = await actions.renameFolder(projectId, folder.id, name)
    report(result)
    return result
  }
  return (
    <section className="grid gap-2">
      <header className="flex items-center gap-3 border-b pb-1.5">
        <h2 className="flex min-w-0 flex-1 text-[15px] font-semibold">
          {controls.renameFolder ? <InlineName label="Folder name" name={folder.name} onRename={rename} /> : folder.name}
        </h2>
        <span data-testid={`folder-progress-${folder.id}`}>
          <ProgressBar done={progress.done} total={progress.total} />
        </span>
        <FolderMenu folder={folder} />
      </header>
      {tasks.length === 0 ? (
        <p className="px-1 text-[13px] text-muted-foreground">No tasks in this folder.</p>
      ) : (
        <ul className="grid gap-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </section>
  )
}
