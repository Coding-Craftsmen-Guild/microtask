'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { PROJECTS_INDEX_PATH, projectPagePath } from '../components/projects/paths'
import { adminCall, type ActionFailure, type ActionResult } from './result'

/**
 * Creates a project and opens it, which is what the app being replaced did on create.
 *
 * Only a refusal comes back: success navigates. The name is sent as typed and cleaned by the
 * server, which collapses whitespace and caps it (ADR 0036).
 */
export async function createProject(name: string): Promise<ActionFailure> {
  const result = await adminCall(PROJECTS_INDEX_PATH, (api) => api.projects.create(name))
  if (!result.ok) return result
  redirect(projectPagePath(result.value.id))
}

/**
 * Renames a project and answers the name the server **stored**.
 *
 * That is not always the name sent: the server collapses whitespace runs, so a caller that
 * showed its own string would show a name that does not exist.
 */
export async function renameProject(projectId: string, name: string): Promise<ActionResult<string>> {
  const result = await adminCall(projectPagePath(projectId), async (api) => {
    const renamed = await api.projects.rename(projectId, name)
    return renamed.name
  })
  if (result.ok) refresh()
  return result
}

/**
 * Deletes a project with its folders, tasks, tabs and share links.
 *
 * Its tokens stop resolving at once: the API drops them from its index under the same lock that
 * deletes the files, so there is no window in which a revoked client still gets in.
 */
export async function deleteProject(projectId: string): Promise<ActionResult<null>> {
  const result = await adminCall(PROJECTS_INDEX_PATH, async (api) => {
    await api.projects.remove(projectId)
    return null
  })
  if (result.ok) refresh()
  return result
}
