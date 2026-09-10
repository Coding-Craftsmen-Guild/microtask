import { NotFound, type Product } from '@repo/kernel'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { Progress } from '../entities/progress.js'
import type { TaskDocument } from '../entities/task.js'
import { assertWithin, cleanName } from '../limits.js'
import { agreesWith, countTabs } from '../progress.js'
import type { ServiceContext } from './context.js'
import { reordered } from './positions.js'
import type { ProjectRef, TaskRef } from './refs.js'
import {
  assertFolder,
  groupOf,
  movedTo,
  newTaskDocument,
  pickTask,
  withGroup,
  withTask,
  without,
} from './task-mapper.js'

/** A task as a reader gets it: its manifest entry, its cache corrected, and its document. */
export interface TaskDetail {
  readonly entry: TaskEntry
  readonly document: TaskDocument
}

/** Creates, reads, renames, removes, moves and reorders the tasks of one project. */
export class TaskService {
  readonly #ctx: ServiceContext

  /** Creates the service over an injected context. */
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx
  }

  /** Creates a task at the end of its folder, writing its document before the manifest. */
  async create(at: ProjectRef, name: string, folderId: string | null = null): Promise<TaskEntry> {
    const cleaned = cleanName(name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      assertWithin('tasksPerProject', current.tasks.length)
      assertFolder(current, folderId)
      const stamp = this.#ctx.clock.now()
      const id = this.#ctx.ids.entityId()
      const document = newTaskDocument(id, this.#ctx.ids.entityId(), stamp)
      const entry: TaskEntry = {
        id,
        name: cleaned,
        folderId,
        position: groupOf(current.tasks, folderId).length,
        progress: countTabs(document.tabs),
      }
      const next = { ...current, tasks: [...current.tasks, entry], updatedAt: stamp }
      await this.#ctx.store.saveTask(at.product, next, document)
      return entry
    })
  }

  /**
   * Reads a task, correcting its cached progress when the document disagrees (ADR 0007).
   *
   * The correction is a write, so it runs inside the lock and re-reads the manifest there; a
   * caller already holding the lock must therefore not call this. Nothing in this service does.
   */
  async read(at: TaskRef): Promise<TaskDetail> {
    const current = await this.#manifest(at)
    const entry = pickTask(current, at.taskId)
    const document = await this.#ctx.store.readTask(at.product, at.projectId, at.taskId)
    if (document === null) throw new NotFound('Task not found')
    const counted = countTabs(document.tabs)
    if (agreesWith(entry.progress, counted)) return { entry, document }
    return { entry: await this.#correct(at, counted), document }
  }

  /** Renames a task. Touches no document, so it writes the manifest alone. */
  async rename(at: TaskRef, name: string): Promise<TaskEntry> {
    const cleaned = cleanName(name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      const next: TaskEntry = { ...pickTask(current, at.taskId), name: cleaned }
      await this.#save(at.product, withTask(current, next))
      return next
    })
  }

  /** Removes a task, writing the manifest before its document is unlinked (ADR 0006). */
  async remove(at: TaskRef): Promise<void> {
    await this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      const tasks = without(current.tasks, pickTask(current, at.taskId))
      const next = { ...current, tasks, updatedAt: this.#ctx.clock.now() }
      await this.#ctx.store.deleteTask(at.product, next, at.taskId)
    })
  }

  /** Moves a task to the end of another folder, or to the project root when given null. */
  async move(at: TaskRef, folderId: string | null): Promise<TaskEntry> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      const task = pickTask(current, at.taskId)
      assertFolder(current, folderId)
      const next = { ...current, tasks: movedTo(current.tasks, task, folderId) }
      await this.#save(at.product, next)
      return pickTask(next, at.taskId)
    })
  }

  /** Renumbers one folder's tasks into the order given, which must name each exactly once. */
  async reorder(
    at: ProjectRef,
    folderId: string | null,
    taskIds: readonly string[],
  ): Promise<readonly TaskEntry[]> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      assertFolder(current, folderId)
      const group = reordered(groupOf(current.tasks, folderId), taskIds, 'task')
      await this.#save(at.product, { ...current, tasks: withGroup(current.tasks, folderId, group) })
      return group
    })
  }

  /** Reads the project or throws NotFound. Takes no lock, so a locked caller may use it. */
  async #manifest(at: ProjectRef): Promise<ProjectManifest> {
    const found = await this.#ctx.store.readManifest(at.product, at.projectId)
    if (found === null) throw new NotFound('Project not found')
    return found
  }

  /** Writes the manifest, stamping the project as changed. Assumes the caller holds the lock. */
  async #save(product: Product, next: ProjectManifest): Promise<void> {
    await this.#ctx.store.saveManifest(product, { ...next, updatedAt: this.#ctx.clock.now() })
  }

  /** Persists a recomputed cache without stamping the project — nobody edited it. */
  async #correct(at: TaskRef, progress: Progress): Promise<TaskEntry> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      const next: TaskEntry = { ...pickTask(current, at.taskId), progress }
      await this.#ctx.store.saveManifest(at.product, withTask(current, next))
      return next
    })
  }
}
