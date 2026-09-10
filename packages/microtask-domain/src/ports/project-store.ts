import type { Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'

/** Persistence for projects, with the write ordering that keeps a crash recoverable. */
export interface ProjectStore {
  /** Reads every project manifest, newest update first. */
  listManifests(product: Product): Promise<readonly ProjectManifest[]>

  /** Reads one project manifest, or null when the project does not exist. */
  readManifest(product: Product, projectId: string): Promise<ProjectManifest | null>

  /** Reads one task's tabs, or null when the task is absent or its content cannot be decoded. */
  readTask(product: Product, projectId: string, taskId: string): Promise<TaskDocument | null>

  /** Writes the manifest alone, for changes that touch no task. */
  saveManifest(product: Product, manifest: ProjectManifest): Promise<void>

  /**
 * Writes the task, then the manifest, in that order, so an interrupted write can only ever
 * leave an unreferenced task behind, never a manifest entry pointing at a task that is gone
 * (ADR 0006).
 */
  saveTask(product: Product, manifest: ProjectManifest, task: TaskDocument): Promise<void>

  /** Writes the manifest, then removes the task, in that order, for the same reason (ADR 0006). */
  deleteTask(product: Product, manifest: ProjectManifest, taskId: string): Promise<void>

  /** Removes a project and everything under it, reporting whether it existed. */
  deleteProject(product: Product, projectId: string): Promise<boolean>
}
