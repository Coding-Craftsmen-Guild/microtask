import { capabilities, type ProjectScopeValue, type RoleValue } from '@repo/contracts'
import { EmptyState } from '@repo/ui/shell/empty-state'
import type { ReactNode } from 'react'
import { linkShareActions, linkTabActions } from '../../../components/link/link-actions'
import { LinkHead } from '../../../components/link/link-head'
import { linkDocumentRoot } from '../../../components/link/paths'
import { ShareManager } from '../../../components/share-manager/share-manager'
import { taskChoices } from '../../../components/share-manager/task-share'
import { shareControls } from '../../../components/share-manager/types'
import { activeTabId } from '../../../components/tabs/active-tab'
import { LiveProgressProvider } from '../../../components/tabs/live-progress'
import { TaskWorkspace } from '../../../components/tabs/task-workspace'
import { readLinkShareCount, readLinkTask } from './read-share'

/** What {@link linkTaskPage} renders one task from. */
export interface LinkTaskInput {
  /** The URL's own token, the only credential this page presents. */
  readonly token: string
  /** The role and scope `shares/current` answered for it. */
  readonly share: { readonly role: RoleValue; readonly scope: ProjectScopeValue }
  /** The task to render, which the scope has already been checked to reach. */
  readonly taskId: string
  /** The untrusted `?tab=`, validated against this task's own tabs. */
  readonly wanted: string | readonly string[] | undefined
  /** `← Back to tasks` on a project-scoped link's task page, nothing on a task-scoped link's. */
  readonly back: ReactNode
}

/**
 * One task on the client surface: the head, and the admin task page's tab strip and editor,
 * drawn from `capabilities(role, scope)` and never from the role alone (ADR 0038).
 *
 * So a `view` link gets a non-editable editor with no toolbar and no `+`, a `write` link can add
 * and rename tabs but neither delete nor move one — which the API also refuses — and a `manage`
 * link gets Share in exactly the form its scope allows: create-only for a task scope, which may
 * mint but neither list nor revoke. Every write goes out under this URL's token.
 *
 * `?tab=` is validated against **this task's** tabs and falls back to the first, so no token can
 * reach another task's tab through it (ADR 0037).
 */
export async function linkTaskPage({ token, share, taskId, wanted, back }: LinkTaskInput): Promise<ReactNode> {
  const { projectId } = share.scope
  const can = capabilities(share.role, share.scope)
  const [read, count] = await Promise.all([
    readLinkTask(token, projectId, taskId),
    can['share:read'] ? readLinkShareCount(token, projectId, taskId) : undefined,
  ])
  if (!read.ok) return <div className="grid gap-4 pt-6">{back}<EmptyState>{read.detail}</EmptyState></div>
  const task = read.value
  const tabs = [...task.tabs].sort((a, b) => a.position - b.position)
  const initialTabId = activeTabId(tabs, wanted)
  const ref = { projectId, taskId: task.id }
  const manager = (
    <ShareManager actions={linkShareActions(token)} choices={taskChoices(projectId, task)} controls={shareControls(can)} count={count} exposure="" projectId={projectId} taskId={task.id} />
  )
  return (
    <LiveProgressProvider initial={task.progress} key={task.id}>
      <div className="grid gap-4 pt-6">
        {back}
        <LinkHead live progress={task.progress} share={manager} title={task.name} writable={can['tab:write']} />
        {initialTabId === null ? (
          <EmptyState>This task has no tabs.</EmptyState>
        ) : (
          <TaskWorkspace actions={linkTabActions(token)} audience="link" capabilities={can} documentRoot={linkDocumentRoot(token, ref)} initialTabId={initialTabId} key={task.id} tabs={tabs} task={ref} />
        )}
      </div>
    </LiveProgressProvider>
  )
}
