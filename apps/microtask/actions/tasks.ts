'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { projectPagePath, taskPagePath } from '../components/projects/paths'
import { isPermutationOf, STALE_ORDER } from './permutation'
import { adminCall, flattened, rejected, type ActionFailure, type ActionResult } from './result'

/**
 * Creates a task in the folder named, or at the project root for `null`, and opens it.
 *
 * Opening it is what the app being replaced did when its equivalent — a legacy "project" — was
 * created. Only a refusal comes back; success navigates.
 */
export async function createTask(
  projectId: string,
  name: string,
  folderId: string | null,
): Promise<ActionFailure> {
  const result = await adminCall(projectPagePath(projectId), (api) =>
    api.tasks.create(projectId, { name, folderId }),
  )
  if (!result.ok) return result
  redirect(taskPagePath(projectId, result.value.id))
}

/** Renames a task and answers the name the server stored, which may differ from the one sent. */
export async function renameTask(
  projectId: string,
  taskId: string,
  name: string,
): Promise<ActionResult<string>> {
  const result = await adminCall(projectPagePath(projectId), async (api) => {
    const renamed = await api.tasks.rename({ projectId, taskId }, name)
    return renamed.name
  })
  if (result.ok) refresh()
  return result
}

/** Deletes a task and its tabs. */
export async function deleteTask(projectId: string, taskId: string): Promise<ActionResult<null>> {
  const result = await adminCall(projectPagePath(projectId), async (api) => {
    await api.tasks.remove({ projectId, taskId })
    return null
  })
  if (result.ok) refresh()
  return result
}

/** Moves a task to the end of another folder, or to the project root for `null`. */
export async function moveTask(
  projectId: string,
  taskId: string,
  folderId: string | null,
): Promise<ActionResult<null>> {
  const result = await adminCall(projectPagePath(projectId), async (api) => {
    await api.tasks.move({ projectId, taskId }, folderId)
    return null
  })
  if (result.ok) refresh()
  return result
}

/**
 * Renumbers one folder group's tasks into the order given; `null` names the project root.
 *
 * Checked against a **fresh read** of that one group and refused unless it names each of its
 * tasks exactly once, for the reason {@link reorderFolders} gives: a partial order is a stale
 * page, and the task it leaves out is the one somebody else just added.
 */
export async function reorderTasks(
  projectId: string,
  folderId: string | null,
  taskIds: readonly string[],
): Promise<ActionResult<null>> {
  const result = flattened(
    await adminCall(projectPagePath(projectId), async (api): Promise<ActionResult<null>> => {
      const { tasks } = await api.projects.read(projectId)
      const group = tasks.filter((task) => task.folderId === folderId).map((task) => task.id)
      if (!isPermutationOf(group, taskIds)) return rejected(409, STALE_ORDER)
      await api.tasks.reorder(projectId, folderId, taskIds)
      return { ok: true, value: null }
    }),
  )
  if (result.ok) refresh()
  return result
}
