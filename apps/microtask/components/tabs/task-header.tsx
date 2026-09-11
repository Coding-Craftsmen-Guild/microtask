import type { Capabilities } from '@repo/contracts'
import { ShareManager } from '../share-manager/share-manager'
import { taskChoices } from '../share-manager/task-share'
import { shareControls, type ShareActions } from '../share-manager/types'

/** Props for {@link TaskHeader}. */
export interface TaskHeaderProps {
  /** The project the task is filed in. */
  projectId: string
  /** The task: its id and the name the page is headed with. */
  task: { readonly id: string; readonly name: string }
  /** Links scoped to this task, counted on the server; `undefined` when the caller was not told. */
  count: number | undefined
  /** What the viewer may do, from which Share and each of its controls is drawn. */
  can: Capabilities
  /** The share manager's reads and writes. */
  share: ShareActions
}

/**
 * The task page's head: its name, and Share for this task — where the app being replaced drew
 * Share, in the title row of the page that holds the editor.
 *
 * The manager is the project page's, scoped to this task: it lists this task's links, offers to
 * mint over this task only, and is handed a count rather than a link, so no token is in this
 * page's HTML (ADR 0033). With no project scope on offer there is no project-wide confirm to
 * word, so it is given no exposure to say. Every control is drawn from `can` (ADR 0038).
 */
export function TaskHeader({ projectId, task, count, can, share }: TaskHeaderProps) {
  return (
    <div className="flex items-center gap-4 max-sm:flex-wrap">
      <h1 className="min-w-0 flex-1 text-2xl font-bold tracking-tight">{task.name}</h1>
      <ShareManager
        actions={share}
        choices={taskChoices(projectId, task)}
        controls={shareControls(can)}
        count={count}
        exposure=""
        projectId={projectId}
        taskId={task.id}
      />
    </div>
  )
}
