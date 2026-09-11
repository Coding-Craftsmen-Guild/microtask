import type { ProgressValue } from '@repo/contracts'
import type { ActionFailure, ActionResult } from '../../actions/result'
import type { TreeFolder, TreeTask } from './tree-model'

/** A task row's data: a manifest entry, which carries everything a row renders (ADR 0034). */
export interface RowTask extends TreeTask {
  /** Its cached checklist count (ADR 0007). */
  readonly progress: ProgressValue
  /** When its task file was last written. */
  readonly updatedAt: string
  /** How many tabs it has in all. */
  readonly tabCount: number
  /** The first eight tab names. */
  readonly tabNames: readonly string[]
}

/**
 * Every write the tree can ask for, each a Server Action the page hands in.
 *
 * A prop rather than an import, so the same tree renders for a share-link holder with actions
 * that carry the link's authority instead of an admin's — the components never decide whose
 * credential a write goes out under (ADR 0012).
 */
export interface TreeActions {
  /** Creates a folder. */
  createFolder: (projectId: string, name: string) => Promise<ActionResult<null>>
  /** Renames a folder, answering the stored name. */
  renameFolder: (projectId: string, folderId: string, name: string) => Promise<ActionResult<string>>
  /** Deletes a folder; its tasks move to the root. */
  deleteFolder: (projectId: string, folderId: string) => Promise<ActionResult<null>>
  /** Renumbers every folder. */
  reorderFolders: (projectId: string, folderIds: readonly string[]) => Promise<ActionResult<null>>
  /** Creates a task and opens it, so only a refusal comes back. */
  createTask: (projectId: string, name: string, folderId: string | null) => Promise<ActionFailure | undefined>
  /** Renames a task, answering the stored name. */
  renameTask: (projectId: string, taskId: string, name: string) => Promise<ActionResult<string>>
  /** Deletes a task. */
  deleteTask: (projectId: string, taskId: string) => Promise<ActionResult<null>>
  /** Moves a task to a folder, or to the root for `null`. */
  moveTask: (projectId: string, taskId: string, folderId: string | null) => Promise<ActionResult<null>>
  /** Renumbers one folder group's tasks. */
  reorderTasks: (
    projectId: string,
    folderId: string | null,
    taskIds: readonly string[],
  ) => Promise<ActionResult<null>>
}

/** A folder, as the tree receives it. */
export type RowFolder = TreeFolder
