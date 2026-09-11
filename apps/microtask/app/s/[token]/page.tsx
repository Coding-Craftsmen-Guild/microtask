import { EmptyState } from '@repo/ui/shell/empty-state'
import type { Metadata } from 'next'
import { linkListPage } from './link-list-page'
import { linkTaskPage } from './link-task-page'
import { readLinkTask, readShare } from './read-share'

/** What Next hands a link page: the token segment and an untrusted query string. */
export interface LinkPageProps {
  /** The share token, which is the page's whole credential (ADR 0040). */
  readonly params: Promise<{ token: string }>

  /** The query string; `?tab=` is the only member read, and a repeated one arrives as an array. */
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TITLE = 'Shared · CC Guild Microtask'

/** The tab title: the task's name for a task-scoped link, the project's for a project-scoped one. */
export async function generateMetadata({ params }: LinkPageProps): Promise<Metadata> {
  const { token } = await params
  const share = await readShare(token)
  if (!share.ok) return { title: TITLE }
  const { scope, project } = share.value
  if (scope.kind === 'project') return { title: `${project.name} · CC Guild Microtask` }
  const task = await readLinkTask(token, scope.projectId, scope.taskId)
  return { title: task.ok ? `${task.value.name} · CC Guild Microtask` : TITLE }
}

/**
 * `/s/<token>`: whatever the token's scope resolves to, decided by `shares/current` (ADR 0037).
 *
 * A task-scoped link **is** its task, with no list, because it must not learn that siblings
 * exist; a project-scoped link is the list of the tasks its scope contains. The token is taken
 * from `params` and is the only authority the page presents: no cookie is read, so an admin
 * signed in on the same browser sees exactly what the client sees (ADR 0040). A token that no
 * longer resolves has already been sent to `/s/unavailable` by the read.
 */
export default async function LinkPage({ params, searchParams }: LinkPageProps) {
  const { token } = await params
  const share = await readShare(token)
  if (!share.ok) {
    return (
      <div className="pt-6">
        <EmptyState>{share.detail}</EmptyState>
      </div>
    )
  }
  const { scope } = share.value
  if (scope.kind === 'project') return linkListPage(token, share.value)
  return linkTaskPage({ token, share: share.value, taskId: scope.taskId, wanted: (await searchParams)['tab'], back: null })
}
