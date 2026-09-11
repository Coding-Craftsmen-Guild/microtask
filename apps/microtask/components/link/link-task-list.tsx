import { EmptyState } from '@repo/ui/shell/empty-state'
import { groupsOf, type TreeFolder } from '../task-tree/tree-model'
import { NO_SHARED_TASKS } from './copy'
import { LinkTaskRow, type LinkRowTask } from './link-task-row'

/** Props for {@link LinkTaskList}. */
export interface LinkTaskListProps {
  /** The link's own token. */
  token: string
  /** The folders the link may see; drawn only when `showFolders`. */
  folders: readonly TreeFolder[]
  /** The task entries the link reaches, as `shares/current` answered them. */
  tasks: readonly (LinkRowTask & { readonly folderId: string | null; readonly position: number })[]
  /** Whether the folder tree is reachable: `mayReach(role, scope, 'project:read', 'folder')`. */
  showFolders: boolean
}

/**
 * A project-scoped link's landing page: its tasks, by folder, each linking to its own page.
 *
 * The folders are drawn only where the policy clears a `folder` target — the second target
 * `project:read` is gated on (ADR 0038) — so the grouping is a rendering answer and never a guess.
 * Everything here is what `shares/current` already answered, which carries no token (ADR 0017).
 */
export function LinkTaskList({ token, folders, tasks, showFolders }: LinkTaskListProps) {
  if (tasks.length === 0) return <EmptyState>{NO_SHARED_TASKS}</EmptyState>
  const groups = groupsOf(showFolders ? folders : [], tasks).filter((group) => group.tasks.length > 0)
  return (
    <div className="grid gap-5">
      {groups.map((group) => (
        <section className="grid gap-2" key={group.folder?.id ?? 'root'}>
          {group.folder === null ? null : <h2 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{group.folder.name}</h2>}
          <ul className="grid gap-2.5">
            {group.tasks.map((task) => (
              <LinkTaskRow key={task.id} task={task} token={token} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
