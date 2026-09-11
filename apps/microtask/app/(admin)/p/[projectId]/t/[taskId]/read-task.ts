import { cache } from 'react'
import type { Decoded } from '@repo/api-client'
import type { TaskView } from '@repo/contracts'
import { adminRead, type ActionResult } from '../../../../../../actions/result'
import { taskPagePath } from '../../../../../../components/projects/paths'

/** What the task page renders from: the task, or the sentence the API refused it with. */
export type TaskRead = ActionResult<Decoded<typeof TaskView>>

/**
 * Reads one task for the admin surface, once per request.
 *
 * Through `adminRead`, as the project page reads its project: no session and a 401 both redirect
 * to `/login?next=` with this task's path, so an expired admin comes back to it (ADR 0032); a
 * task or project the API does not hold, or an id that is not an id, is `notFound()`; and any
 * other refusal comes back as its sentence, which the page shows in place of the document — the
 * failure state legacy drew.
 *
 * Wrapped in React's `cache` so `generateMetadata` and the page share one read.
 */
export const readTask = cache(
  async (projectId: string, taskId: string): Promise<TaskRead> =>
    adminRead(taskPagePath(projectId, taskId), (api) => api.tasks.read({ projectId, taskId })),
)
