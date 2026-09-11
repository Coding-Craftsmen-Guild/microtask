import { TaskEntry, TaskEntryList, TaskView, type CreateTaskPayload } from '@repo/contracts'
import { projectPath, taskPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded, TaskRef } from '../types.js'

const tasksPath = (projectId: string): string => `${projectPath(projectId)}/tasks`

/** What creating a task needs, taken from the contract so the client cannot drift from it. */
export type NewTask = Decoded<typeof CreateTaskPayload>

/** Everything a caller may ask of a project's tasks. */
export interface TasksApi {
  /** Creates a task, optionally filed in a folder that already exists in this project. */
  create(projectId: string, task: NewTask): Promise<Decoded<typeof TaskEntry>>

  /**
   * Renumbers one folder group's tasks into the order given.
   *
   * Positions are dense **per folder**, not per project, so the group has to be named and `null`
   * means the project root. The API requires a strict permutation of that one group.
   */
  reorder(
    projectId: string,
    folderId: string | null,
    taskIds: readonly string[],
  ): Promise<Decoded<typeof TaskEntryList>>

  /** Reads one task with its tabs, shaped for whoever asked. */
  read(ref: TaskRef): Promise<Decoded<typeof TaskView>>

  /** Renames one task. */
  rename(ref: TaskRef, name: string): Promise<Decoded<typeof TaskEntry>>

  /** Moves one task between folders; `null` is the project root, said explicitly. */
  move(ref: TaskRef, folderId: string | null): Promise<Decoded<typeof TaskEntry>>

  /** Removes one task and its tabs. */
  remove(ref: TaskRef): Promise<void>
}

/** Binds the task operations to a transport. */
export function tasksApi(transport: Transport): TasksApi {
  return {
    create: (projectId, task) =>
      transport.json({ method: 'POST', path: tasksPath(projectId), body: task }, TaskEntry),
    reorder: (projectId, folderId, taskIds) =>
      transport.json(
        { method: 'POST', path: `${tasksPath(projectId)}/reorder`, body: { folderId, taskIds } },
        TaskEntryList,
      ),
    read: (ref) => transport.json({ method: 'GET', path: taskPath(ref) }, TaskView),
    rename: (ref, name) =>
      transport.json({ method: 'PATCH', path: taskPath(ref), body: { name } }, TaskEntry),
    move: (ref, folderId) =>
      transport.json(
        { method: 'POST', path: `${taskPath(ref)}/move`, body: { folderId } },
        TaskEntry,
      ),
    remove: (ref) => transport.empty({ method: 'DELETE', path: taskPath(ref) }),
  }
}
