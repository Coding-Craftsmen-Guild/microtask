import { capabilities, mayReach, type Capabilities, type ProjectScopeValue, type RoleValue } from '@repo/contracts'
import { ADMIN_CAPABILITIES } from '../shared/admin-capabilities'

/** Which tree controls to draw. Each is a rendering answer, never a gate (ADR 0038). */
export interface TreeControls {
  /** Whether the folder tree is drawn at all: the folder list is gated on a `folder` target. */
  readonly folders: boolean
  /** `+ Folder`. */
  readonly createFolder: boolean
  /** Editing a folder's name. */
  readonly renameFolder: boolean
  /** Deleting a folder. */
  readonly deleteFolder: boolean
  /** Moving a folder up or down. */
  readonly reorderFolders: boolean
  /** `+ Task`, and "New task here" on a folder. */
  readonly createTask: boolean
  /** Renaming a task. */
  readonly renameTask: boolean
  /** Deleting a task. */
  readonly deleteTask: boolean
  /** Moving a task to another folder, which needs the folders to be visible to choose from. */
  readonly moveTask: boolean
  /** Moving a task up or down within its folder. */
  readonly reorderTasks: boolean
}

/**
 * The tree's controls, from the capability record and whether the folder list is reachable.
 *
 * `foldersVisible` is asked separately because `project:read` is gated on **two** targets, and
 * the record answers only the project one: a task scope reads its project and is refused its
 * folders (ADR 0038's amendment). The folder controls need no second check — each is decided
 * against a `folder` target, which the record already refuses wherever the list is refused — but a
 * task move is decided against the task, and still needs the folders on screen to choose from.
 */
export function treeControls(can: Capabilities, foldersVisible: boolean): TreeControls {
  return {
    folders: foldersVisible,
    createFolder: can['folder:create'],
    renameFolder: can['folder:rename'],
    deleteFolder: can['folder:delete'],
    reorderFolders: can['folder:reorder'],
    createTask: can['task:create'],
    renameTask: can['task:rename'],
    deleteTask: can['task:delete'],
    moveTask: foldersVisible && can['task:move'],
    reorderTasks: can['task:reorder'],
  }
}

/** The tree an admin sees: everything. */
export const ADMIN_TREE: TreeControls = treeControls(ADMIN_CAPABILITIES, true)

/** The tree a share-link holder sees, from its role **and** scope — never from role alone. */
export const linkTreeControls = (role: RoleValue, scope: ProjectScopeValue): TreeControls =>
  treeControls(capabilities(role, scope), mayReach(role, scope, 'project:read', 'folder'))
