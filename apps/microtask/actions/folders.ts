'use server'

import { refresh } from 'next/cache'
import { projectPagePath } from '../components/projects/paths'
import { isPermutationOf, STALE_ORDER } from './permutation'
import { adminCall, flattened, rejected, type ActionResult } from './result'

/** Creates a folder at the end of the project's order. */
export async function createFolder(projectId: string, name: string): Promise<ActionResult<null>> {
  const result = await adminCall(projectPagePath(projectId), async (api) => {
    await api.folders.create(projectId, name)
    return null
  })
  if (result.ok) refresh()
  return result
}

/** Renames a folder and answers the name the server stored, which may differ from the one sent. */
export async function renameFolder(
  projectId: string,
  folderId: string,
  name: string,
): Promise<ActionResult<string>> {
  const result = await adminCall(projectPagePath(projectId), async (api) => {
    const renamed = await api.folders.rename(projectId, folderId, name)
    return renamed.name
  })
  if (result.ok) refresh()
  return result
}

/** Deletes a folder. Its tasks are not deleted: the API moves them to the project root. */
export async function deleteFolder(projectId: string, folderId: string): Promise<ActionResult<null>> {
  const result = await adminCall(projectPagePath(projectId), async (api) => {
    await api.folders.remove(projectId, folderId)
    return null
  })
  if (result.ok) refresh()
  return result
}

/**
 * Renumbers the project's folders into the order given.
 *
 * The order is checked against a **fresh read** of the folders before it is sent, and refused
 * unless it names each exactly once: the browser's list is a proposal, and a partial one would
 * be the stale page of somebody who has not seen a folder added since.
 */
export async function reorderFolders(
  projectId: string,
  folderIds: readonly string[],
): Promise<ActionResult<null>> {
  const result = flattened(
    await adminCall(projectPagePath(projectId), async (api): Promise<ActionResult<null>> => {
      const { folders } = await api.folders.list(projectId)
      const current = folders.map((folder) => folder.id)
      if (!isPermutationOf(current, folderIds)) return rejected(409, STALE_ORDER)
      await api.folders.reorder(projectId, folderIds)
      return { ok: true, value: null }
    }),
  )
  if (result.ok) refresh()
  return result
}
