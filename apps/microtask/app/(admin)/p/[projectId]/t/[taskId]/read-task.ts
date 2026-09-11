import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Decoded } from '@repo/api-client'
import type { TaskView } from '@repo/contracts'
import { adminCall, type ActionResult } from '../../../../../../actions/result'
import { taskPagePath } from '../../../../../../components/projects/paths'

/** What the task page renders from: the task, or the sentence the API refused it with. */
export type TaskRead = ActionResult<Decoded<typeof TaskView>>

const MISSING = new Set([404, 422])

/**
 * Reads one task for the admin surface, once per request.
 *
 * Through the same `adminCall` every admin read and write in this app goes through, so no session
 * and a 401 both redirect to `/login?next=` with this task's path, and an expired admin comes
 * back to it (ADR 0032). A task or project the API does not hold — or an id that is not an id,
 * which it answers 422 — is `notFound()`, as the project page treats its own. Any other refusal
 * comes back as its sentence, which the page shows in place of the document — the failure state
 * legacy drew — rather than being thrown into an error boundary that production strips of its
 * message.
 *
 * Wrapped in React's `cache` so `generateMetadata` and the page share one read.
 */
export const readTask = cache(async (projectId: string, taskId: string): Promise<TaskRead> => {
  const result = await adminCall(taskPagePath(projectId, taskId), (api) => api.tasks.read({ projectId, taskId }))
  if (!result.ok && MISSING.has(result.status)) notFound()
  return result
})
