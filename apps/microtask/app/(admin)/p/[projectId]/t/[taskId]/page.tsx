import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@repo/ui/shell/empty-state'
import { createTab, deleteTab, renameTab, reorderTabs } from '../../../../../../actions/tabs'
import { projectPagePath } from '../../../../../../components/projects/paths'
import { activeTabId } from '../../../../../../components/tabs/active-tab'
import { adminDocumentRoot } from '../../../../../../components/tabs/save-tab'
import { ADMIN_CAPABILITIES } from '../../../../../../components/tabs/tab-controls'
import { TaskWorkspace } from '../../../../../../components/tabs/task-workspace'
import { readTask } from './read-task'

/** What Next hands the task page: two path segments and an untrusted query string. */
export interface TaskPageProps {
  /** The project and task named by the path. */
  readonly params: Promise<{ projectId: string; taskId: string }>

  /** The query string; `?tab=` is the only member read, and a repeated one arrives as an array. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TAB_ACTIONS = { create: createTab, rename: renameTab, remove: deleteTab, reorder: reorderTabs }

/** The tab title: `<task name> · CC Guild Microtask`, which is legacy's `<project name> · …`. */
export async function generateMetadata({ params }: TaskPageProps): Promise<Metadata> {
  const { projectId, taskId } = await params
  const read = await readTask(projectId, taskId)
  return { title: read.ok ? `${read.value.name} · CC Guild Microtask` : 'Task · CC Guild Microtask' }
}

const BackLink = ({ projectId }: { projectId: string }) => (
  <Link className="text-sm text-muted-foreground no-underline hover:text-brand" href={projectPagePath(projectId)}>
    ← Back to project
  </Link>
)

/**
 * `/p/[projectId]/t/[taskId]`: one task's tabs and the editor, on the admin surface.
 *
 * `?tab=` is validated here against the task's own tabs, falling back to the first, and the
 * workspace then keeps the address bar in step with `replaceState` (ADR 0037's semantics, which
 * the admin page shares). The workspace is keyed on the task, so moving between two tasks
 * mounts a fresh one rather than carrying one task's open tab into the other.
 *
 * The admin is not a capability role, so the controls are drawn from `ADMIN_CAPABILITIES` — the
 * same record shape the client surface fills from `capabilities(role, scope)`.
 */
export default async function TaskPage({ params, searchParams }: TaskPageProps) {
  const { projectId, taskId } = await params
  const read = await readTask(projectId, taskId)
  if (!read.ok) {
    return (
      <div className="grid gap-4 pt-6">
        <BackLink projectId={projectId} />
        <EmptyState>{read.detail}</EmptyState>
      </div>
    )
  }
  const task = read.value
  const tabs = [...task.tabs].sort((a, b) => a.position - b.position)
  const initialTabId = activeTabId(tabs, (await searchParams)['tab'])
  return (
    <div className="grid gap-4 pt-6">
      <BackLink projectId={projectId} />
      <h1 className="text-2xl font-bold tracking-tight">{task.name}</h1>
      {initialTabId === null ? (
        <EmptyState>This task has no tabs.</EmptyState>
      ) : (
        <TaskWorkspace
          actions={TAB_ACTIONS}
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
