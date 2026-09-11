'use client'

import { buttonVariants } from '@repo/ui/components/button'
import { ProgressBar } from '@repo/ui/shell/progress-bar'
import Link from 'next/link'
import { useState } from 'react'
import { Chips } from '../projects/chips'
import { MetaLine } from '../projects/meta-line'
import { taskPagePath } from '../projects/paths'
import { countsLine } from '../projects/summary'
import { TaskMenu } from './task-menu'
import { TaskName } from './task-name'
import { useTree } from './tree-context'
import type { RowTask } from './types'

/**
 * One task row, in the shape the app being replaced drew for what it called a project: the name,
 * `N tabs · N share links · updated Nh ago`, the tab chips, the cached progress bar, and Open.
 *
 * The share-links clause counts links scoped to **this task**, counted on the server; the
 * project's own project-scoped links are counted on the project, not spread across its tasks.
 */
export function TaskRow({ task }: { task: RowTask }) {
  const { projectId, linkCounts, now } = useTree()
  const [renaming, setRenaming] = useState(false)
  const links = linkCounts === undefined ? undefined : (linkCounts[task.id] ?? 0)
  return (
    <li className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 max-sm:flex-wrap">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <TaskName onDone={() => setRenaming(false)} renaming={renaming} task={task} />
        <MetaLine counts={countsLine(task.tabCount, 'tab', links)} now={now} updatedAt={task.updatedAt} />
        <Chips label="Tabs" names={task.tabNames} total={task.tabCount} />
      </div>
      <ProgressBar done={task.progress.done} total={task.progress.total} />
      <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={taskPagePath(projectId, task.id)}>
        Open
      </Link>
      <TaskMenu onRename={() => setRenaming(true)} task={task} />
    </li>
  )
}
