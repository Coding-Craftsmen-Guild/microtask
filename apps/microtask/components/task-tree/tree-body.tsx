'use client'

import { EmptyState } from '@repo/ui/shell/empty-state'
import { FolderSection } from './folder-section'
import { TaskRow } from './task-row'
import type { TreeGroup } from './tree-model'
import type { RowFolder, RowTask } from './types'

/** Props for {@link TreeBody}. */
export interface TreeBodyProps {
  /** The groups to draw, already filtered. */
  groups: readonly TreeGroup<RowFolder, RowTask>[]
  /** The search term, quoted back when nothing matches. */
  term: string
  /** Whether the project has nothing in it at all. */
  empty: boolean
}

/** The tree's groups, or the empty state, or "nothing matches". */
export function TreeBody({ groups, term, empty }: TreeBodyProps) {
  if (empty) return <EmptyState>No tasks yet — create your first one above.</EmptyState>
  if (groups.length === 0) {
    return <p className="py-4 text-center text-muted-foreground">{`Nothing matches “${term.trim()}”.`}</p>
  }
  return (
    <div className="grid gap-5">
      {groups.map((group) =>
        group.folder === null ? (
          <ul className="grid gap-2" key="root">
            {group.tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        ) : (
          <FolderSection folder={group.folder} key={group.folder.id} tasks={group.tasks} />
        ),
      )}
    </div>
  )
}
