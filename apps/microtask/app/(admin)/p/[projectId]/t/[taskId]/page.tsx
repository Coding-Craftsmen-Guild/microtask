import type { Metadata } from 'next'
import { EmptyState } from '@repo/ui/shell/empty-state'
import { ADMIN_SHARE_ACTIONS, ADMIN_TAB_ACTIONS } from '../../../../../../components/projects/admin-actions'
import { projectPagePath } from '../../../../../../components/projects/paths'
import { ADMIN_CAPABILITIES } from '../../../../../../components/shared/admin-capabilities'
import { BackLink } from '../../../../../../components/shared/back-link'
import { activeTabId } from '../../../../../../components/tabs/active-tab'
import { adminDocumentRoot } from '../../../../../../components/tabs/save-tab'
import { TaskHeader } from '../../../../../../components/tabs/task-header'
import { TaskWorkspace } from '../../../../../../components/tabs/task-workspace'
import { readShareCount } from './read-share-count'
import { readTask } from './read-task'

/** What Next hands the task page: two path segments and an untrusted query string. */
export interface TaskPageProps {
  /** The project and task named by the path. */
  readonly params: Promise<{ projectId: string; taskId: string }>

  /** The query string; `?tab=` is the only member read, and a repeated one arrives as an array. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** The tab title: `<task name> · CC Guild Microtask`, which is legacy's `<project name> · …`. */
export async function generateMetadata({ params }: TaskPageProps): Promise<Metadata> {
  const { projectId, taskId } = await params
  const read = await readTask(projectId, taskId)
  return { title: read.ok ? `${read.value.name} · CC Guild Microtask` : 'Task · CC Guild Microtask' }
}

/**
 * `/p/[projectId]/t/[taskId]`: one task's name and Share, its tabs, and the editor.
 *
 * `?tab=` is validated here against the task's own tabs, falling back to the first, and the
 * workspace then keeps the address bar in step with `replaceState` (ADR 0037's semantics, which
 * the admin page shares). The workspace is keyed on the task, so moving between two tasks
 * mounts a fresh one rather than carrying one task's open tab into the other.
 *
 * Share is the project page's manager scoped to this task, handed a count the server reduced
 * from the links and never a link (ADR 0033). The admin is not a capability role, so every
 * control is drawn from `ADMIN_CAPABILITIES` — the record shape the client surface fills from
 * `capabilities(role, scope)` (ADR 0038).
 */
export default async function TaskPage({ params, searchParams }: TaskPageProps) {
  const { projectId, taskId } = await params
  const [read, shareCount] = await Promise.all([readTask(projectId, taskId), readShareCount(projectId, taskId)])
  const back = <BackLink href={projectPagePath(projectId)}>← Back to project</BackLink>
  if (!read.ok) {
    return (
      <div className="grid gap-4 pt-6">
        {back}
        <EmptyState>{read.detail}</EmptyState>
      </div>
    )
  }
  const task = read.value
  const tabs = [...task.tabs].sort((a, b) => a.position - b.position)
  const initialTabId = activeTabId(tabs, (await searchParams)['tab'])
  return (
    <div className="grid gap-4 pt-6">
      {back}
      <TaskHeader can={ADMIN_CAPABILITIES} count={shareCount} projectId={projectId} share={ADMIN_SHARE_ACTIONS} task={{ id: task.id, name: task.name }} />
      {initialTabId === null ? (
        <EmptyState>This task has no tabs.</EmptyState>
      ) : (
        <TaskWorkspace
          actions={ADMIN_TAB_ACTIONS}
          audience="admin"
          capabilities={ADMIN_CAPABILITIES}
          documentRoot={adminDocumentRoot({ projectId, taskId })}
          initialTabId={initialTabId}
          key={task.id}
          tabs={tabs}
          task={{ projectId, taskId }}
        />
      )}
    </div>
  )
}
