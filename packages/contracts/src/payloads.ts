import { z } from 'zod'
import { EntityId, EntityName } from './document.js'

/**
 * The body of every route whose only input is a display name.
 *
 * One schema rather than a create-shaped and a rename-shaped copy, because they are the same
 * request: a name, bounded the same way, rejected the same way. Two would give a client two
 * types to keep in step and the document two components describing one thing.
 */
export const NamePayload = z
  .object({ name: EntityName })
  .meta({ id: 'NamePayload', description: 'A display name, and nothing else' })

/**
 * The body of the route that creates a task.
 *
 * `folderId` is optional rather than nullable-and-required: a client creating at the project root
 * sends nothing, and one that does send `null` means the same thing. The folder must already
 * exist in this project — the service refuses an unknown one rather than filing the task
 * nowhere.
 */
export const CreateTaskPayload = z
  .object({ name: EntityName, folderId: EntityId.nullable().optional() })
  .meta({ id: 'CreateTaskPayload', description: 'A task name, and optionally the folder to file it in' })

/**
 * The body of the route that moves a task between folders.
 *
 * `folderId` is required and nullable rather than optional, because omitting it and asking for
 * the project root are different intentions and this route only has one of them. `null` is the
 * project root, said explicitly.
 */
export const MoveTaskPayload = z
  .object({ folderId: EntityId.nullable() })
  .meta({ id: 'MoveTaskPayload', description: 'Where a task is being moved to; null is the project root' })

/**
 * The body of the route that renumbers a project's folders.
 *
 * The array carries no length bound of its own: the service requires a **strict permutation** of
 * the folders that exist, which is a stronger check than any maximum, and the global body limit
 * bounds what can be sent at all. A bound here would only be a second number to keep in step.
 */
export const ReorderFoldersPayload = z
  .object({ folderIds: z.array(EntityId).readonly() })
  .meta({ id: 'ReorderFoldersPayload', description: "Every one of a project's folders, in the order wanted" })

/**
 * The body of the route that renumbers one folder group's tasks.
 *
 * Positions are dense **per folder**, not per project, so the group has to be named: `folderId`
 * is required and nullable, where `null` is the project root. `taskIds` must name each task in
 * that one group exactly once.
 */
export const ReorderTasksPayload = z
  .object({ folderId: EntityId.nullable(), taskIds: z.array(EntityId).readonly() })
  .meta({ id: 'ReorderTasksPayload', description: 'One folder group, and every task in it in the order wanted' })

/**
 * The body of the route that renumbers one task's tabs.
 *
 * A bare list, unlike a task reorder: tabs have no grouping below the task, and the task is
 * already named by the path, so there is nothing left for the body to say. Like every reorder
 * here it must name each tab exactly once — the service refuses a partial order rather than
 * silently dropping whatever a stale client had not seen.
 */
export const ReorderTabsPayload = z
  .object({ tabIds: z.array(EntityId).readonly() })
  .meta({ id: 'ReorderTabsPayload', description: "Every one of a task's tabs, in the order wanted" })
