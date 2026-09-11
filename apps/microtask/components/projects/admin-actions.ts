import { renameProject } from '../../actions/projects'
import { createFolder, deleteFolder, renameFolder, reorderFolders } from '../../actions/folders'
import { createShareLink, listShareLinks, revokeShareLink, updateShareLink } from '../../actions/share-links'
import { createTask, deleteTask, moveTask, renameTask, reorderTasks } from '../../actions/tasks'
import type { ShareActions } from '../share-manager/types'
import type { TreeActions } from '../task-tree/types'

/**
 * The tree's writes, each carrying the **admin** authority `mt_admin` names.
 *
 * Collected here so the project page wires one object rather than nine props, and so a link
 * page can wire its own object of link-authority actions into the same components.
 */
export const ADMIN_TREE_ACTIONS: TreeActions = {
  createFolder,
  renameFolder,
  deleteFolder,
  reorderFolders,
  createTask,
  renameTask,
  deleteTask,
  moveTask,
  reorderTasks,
}

/** The share manager's reads and writes, with admin authority. */
export const ADMIN_SHARE_ACTIONS: ShareActions = {
  list: listShareLinks,
  create: createShareLink,
  update: updateShareLink,
  revoke: revokeShareLink,
}

/** The project rename, with admin authority. */
export const ADMIN_RENAME_PROJECT = renameProject
