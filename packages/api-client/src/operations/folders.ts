import { Folder, FolderList } from '@repo/contracts'
import { projectPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'

const foldersPath = (projectId: string): string => `${projectPath(projectId)}/folders`

const folderPath = (projectId: string, folderId: string): string =>
  `${foldersPath(projectId)}/${encodeURIComponent(folderId)}`

/** Everything a caller may ask of a project's folders. */
export interface FoldersApi {
  /** Lists the folders of one project, in the order they are shown. */
  list(projectId: string): Promise<Decoded<typeof FolderList>>

  /** Creates a folder at the end of the order. */
  create(projectId: string, name: string): Promise<Decoded<typeof Folder>>

  /**
   * Renumbers every folder into the order given.
   *
   * The API requires a **strict permutation** of the folders that exist, so a client reordering
   * from a list it read before somebody else added one is refused rather than silently dropping
   * the folder it had not seen.
   */
  reorder(projectId: string, folderIds: readonly string[]): Promise<Decoded<typeof FolderList>>

  /** Renames one folder, leaving its place in the order alone. */
  rename(projectId: string, folderId: string, name: string): Promise<Decoded<typeof Folder>>

  /** Removes one folder; its tasks fall back to the project root. */
  remove(projectId: string, folderId: string): Promise<void>
}

/** Binds the folder operations to a transport. */
export function foldersApi(transport: Transport): FoldersApi {
  return {
    list: (projectId) => transport.json({ method: 'GET', path: foldersPath(projectId) }, FolderList),
    create: (projectId, name) =>
      transport.json({ method: 'POST', path: foldersPath(projectId), body: { name } }, Folder),
    reorder: (projectId, folderIds) =>
      transport.json(
        { method: 'POST', path: `${foldersPath(projectId)}/reorder`, body: { folderIds } },
        FolderList,
      ),
    rename: (projectId, folderId, name) =>
      transport.json(
        { method: 'PATCH', path: folderPath(projectId, folderId), body: { name } },
        Folder,
      ),
    remove: (projectId, folderId) =>
      transport.empty({ method: 'DELETE', path: folderPath(projectId, folderId) }),
  }
}
