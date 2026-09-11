import {
  CAPABILITY_ACTIONS,
  capabilities,
  mayReach,
  type Capabilities,
  type RoleValue,
  type ScopeValue,
} from '@repo/contracts'

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
 * An admin's answers: every action cleared.
 *
 * An admin is not a role in this model and has no scope to ask about, so there is nothing to
 * project — but the tree still takes its controls as a record, so the same components render
 * for a link holder from `capabilities()` without a second code path (ADR 0038).
 */
export const ADMIN_CAPABILITIES: Capabilities = Object.fromEntries(
  CAPABILITY_ACTIONS.map((action) => [action, true]),
) as Capabilities

/**
 * The tree's controls, from the capability record and whether the folder list is reachable.
 *
 * `foldersVisible` is asked separately because `project:read` is gated on **two** targets, and
 * the record answers only the project one: a task scope reads its project and is refused its
 * folders (ADR 0038's amendment). Every folder control, and moving a task between folders, needs
 * the folders to be on screen.
 */
export function treeControls(can: Capabilities, foldersVisible: boolean): TreeControls {
  return {
    folders: foldersVisible,
    createFolder: foldersVisible && can['folder:create'],
    renameFolder: foldersVisible && can['folder:rename'],
    deleteFolder: foldersVisible && can['folder:delete'],
    reorderFolders: foldersVisible && can['folder:reorder'],
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
export const linkTreeControls = (role: RoleValue, scope: ScopeValue): TreeControls =>
  treeControls(capabilities(role, scope), mayReach(role, scope, 'project:read', 'folder'))
