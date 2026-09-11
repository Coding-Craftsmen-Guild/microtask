import type { ProgressValue } from '@repo/contracts'
import { ProgressBar } from '@repo/ui/shell/progress-bar'
import Link from 'next/link'
import { Chips } from '../projects/chips'
import { linkTaskPath } from './paths'

/** A task entry as a project-scoped link's list row draws it (ADR 0034). */
export interface LinkRowTask {
  /** Its id. */
  readonly id: string
  /** Its name. */
  readonly name: string
  /** Its cached checklist count (ADR 0007). */
  readonly progress: ProgressValue
  /** How many tabs it has in all. */
  readonly tabCount: number
  /** The first eight tab names. */
  readonly tabNames: readonly string[]
}

/** Props for {@link LinkTaskRow}. */
export interface LinkTaskRowProps {
  /** The link's own token, which is the only one this row may name. */
  token: string
  /** The task. */
  task: LinkRowTask
}

/**
 * One task in a project-scoped link's list: its name linking to `/s/<token>/t/<taskId>`, its
 * tabs as chips, and its bar — the admin row's shape with none of the admin's controls.
 *
 * The link carries the visitor's own token and the task's id and nothing else, so a client can
 * bookmark or forward one checklist without being handed a second token (ADR 0037).
 */
export function LinkTaskRow({ token, task }: LinkTaskRowProps) {
  return (
    <li className="flex items-center gap-4 rounded-xl bg-card px-4 py-3.5 ring-1 ring-foreground/10 max-sm:flex-wrap">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Link className="font-semibold text-foreground no-underline" href={linkTaskPath(token, task.id)}>
          {task.name}
        </Link>
        <Chips label="Tabs" names={task.tabNames} total={task.tabCount} />
      </div>
      <ProgressBar done={task.progress.done} total={task.progress.total} />
    </li>
  )
}
