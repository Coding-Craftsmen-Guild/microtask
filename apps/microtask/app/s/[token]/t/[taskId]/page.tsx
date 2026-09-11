import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EmptyState } from '@repo/ui/shell/empty-state'
import { linkPath } from '../../../../../components/link/paths'
import { BackLink } from '../../../../../components/shared/back-link'
import { linkTaskPage } from '../../link-task-page'
import { readLinkTask, readShare } from '../../read-share'

/** What Next hands a project-scoped link's task page. */
export interface LinkTaskPageProps {
  /** The share token and the task it is asked to open. */
  readonly params: Promise<{ token: string; taskId: string }>

  /** The query string; `?tab=` is the only member read. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** The tab title: the task's name. */
export async function generateMetadata({ params }: LinkTaskPageProps): Promise<Metadata> {
  const { token, taskId } = await params
  const share = await readShare(token)
  if (!share.ok || share.value.scope.kind !== 'project') return { title: 'Task · CC Guild Microtask' }
  const task = await readLinkTask(token, share.value.scope.projectId, taskId)
  return { title: task.ok ? `${task.value.name} · CC Guild Microtask` : 'Task · CC Guild Microtask' }
}

/**
 * `/s/<token>/t/<taskId>`: one task inside a **project-scoped** link (ADR 0037).
 *
 * For a task-scoped token the route does not exist and answers 404 before any task is read — not
 * a redirect to its own task, which would tell the holder task ids are a thing it may name. For a
 * project-scoped one the task is read under the link's own project and the API scope-checks it
 * like any other target; a task that is not there is the same 404.
 */
export default async function LinkTaskPage({ params, searchParams }: LinkTaskPageProps) {
  const { token, taskId } = await params
  const share = await readShare(token)
  if (!share.ok) {
    return (
      <div className="pt-6">
        <EmptyState>{share.detail}</EmptyState>
      </div>
    )
  }
  if (share.value.scope.kind !== 'project') notFound()
  const back = <BackLink href={linkPath(token)}>← Back to tasks</BackLink>
  return linkTaskPage({ token, share: share.value, taskId, wanted: (await searchParams)['tab'], back })
}
