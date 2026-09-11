import type { ProgressValue } from '@repo/contracts'
import { buttonVariants } from '@repo/ui/components/button'
import { ProgressBar } from '@repo/ui/shell/progress-bar'
import Link from 'next/link'
import type { ActionResult } from '../../actions/result'
import { Chips } from './chips'
import { DeleteProject } from './delete-project'
import { MetaLine } from './meta-line'
import { projectPagePath } from './paths'
import { countsLine, inTreeOrder, progressOf, type ListedTask, type Positioned } from './summary'

/** A project as the index row needs it — a subset of a list item, which carries no tokens. */
export interface IndexedProject {
  /** Its id. */
  readonly id: string
  /** Its name. */
  readonly name: string
  /** Its folders, for the order the chips are drawn in. */
  readonly folders: readonly Positioned[]
  /** Its task entries, with their cached progress. */
  readonly tasks: readonly (ListedTask & { readonly name: string })[]
  /** How many share links it has, or `undefined` when the caller was not told (ADR 0033). */
  readonly shareLinkCount?: number | undefined
  /** When it last changed. */
  readonly updatedAt: string
}

/** Props for {@link ProjectRow}. */
export interface ProjectRowProps {
  /** The project. */
  project: IndexedProject
  /** The instant the page was rendered. */
  now: number
  /** Deletes a project. */
  onDelete: (projectId: string) => Promise<ActionResult<null>>
}

/**
 * One row of the projects index, in the app being replaced's shape one level up.
 *
 * Its "project" is this app's **task**, so the row it drew now describes the level above: the
 * metadata counts tasks where it counted tabs, the chips name tasks where they named tabs, and the
 * bar sums the tasks' cached progress (ADR 0007). Share links are the project's own count.
 */
export function ProjectRow({ project, now, onDelete }: ProjectRowProps) {
  const progress: ProgressValue = progressOf(project.tasks)
  const names = inTreeOrder(project.folders, project.tasks).map((task) => task.name)
  const href = projectPagePath(project.id)
  return (
    <div className="flex items-center gap-4 rounded-xl bg-card px-4 py-3.5 ring-1 ring-foreground/10 max-sm:flex-wrap">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Link className="font-semibold text-foreground no-underline" data-testid="project-name" href={href}>
          {project.name}
        </Link>
        <MetaLine counts={countsLine(project.tasks.length, 'task', project.shareLinkCount)} now={now} updatedAt={project.updatedAt} />
        <Chips label="Tasks" names={names} total={names.length} />
      </div>
      <ProgressBar done={progress.done} total={progress.total} />
      <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={href}>
        Open
      </Link>
      <DeleteProject name={project.name} onDelete={onDelete} projectId={project.id} />
    </div>
  )
}
