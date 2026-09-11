import { renameProject } from '../../actions/projects'
import { createFolder, deleteFolder, renameFolder, reorderFolders } from '../../actions/folders'
import { createShareLink, listShareLinks, revokeShareLink, updateShareLink } from '../../actions/share-links'
import { createTab, deleteTab, renameTab, reorderTabs } from '../../actions/tabs'
import { createTask, deleteTask, moveTask, renameTask, reorderTasks } from '../../actions/tasks'
import type { ShareActions } from '../share-manager/types'
import type { TabActions } from '../tabs/use-tab-operations'
import type { TreeActions } from '../task-tree/types'

/**
 * The tree's writes, each carrying the **admin** authority `mt_admin` names.
 *
 * Every object here is collected so an admin page wires one object rather than a prop per
 * action, and so a link page can wire its own objects of link-authority actions into the same
 * components: the components never decide whose credential a write goes out under.
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

/** The share manager's reads and writes, with admin authority — on the project and the task page. */
export const ADMIN_SHARE_ACTIONS: ShareActions = {
  list: listShareLinks,
  create: createShareLink,
  update: updateShareLink,
  revoke: revokeShareLink,
}

/** The tab strip's structural writes, with admin authority. */
export const ADMIN_TAB_ACTIONS: TabActions = {
  create: createTab,
  rename: renameTab,
  remove: deleteTab,
  reorder: reorderTabs,
}

/** The project rename, with admin authority. */
export const ADMIN_RENAME_PROJECT = renameProject
