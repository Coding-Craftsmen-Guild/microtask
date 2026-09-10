import type { Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'

/** Persistence for projects, with the write ordering that keeps a crash recoverable. */
export interface ProjectStore {
  /** Reads every project manifest, newest update first. */
  listManifests(product: Product): Promise<readonly ProjectManifest[]>

  /** Reads one project manifest, or null when the project does not exist. */
  readManifest(product: Product, projectId: string): Promise<ProjectManifest | null>

  /** Reads one task's tabs, or null when the task file is missing or unreadable. */
  readTask(product: Product, projectId: string, taskId: string): Promise<TaskDocument | null>

  /** Writes the manifest alone, for changes that touch no task file. */
  saveManifest(product: Product, manifest: ProjectManifest): Promise<void>

  /** Writes the task file, then the manifest, so a crash can only orphan a file. */
  saveTask(product: Product, manifest: ProjectManifest, task: TaskDocument): Promise<void>

  /** Writes the manifest, then unlinks the task file, in that order. */
  deleteTask(product: Product, manifest: ProjectManifest, taskId: string): Promise<void>

  /** Removes a project and everything under it, reporting whether it existed. */
  deleteProject(product: Product, projectId: string): Promise<boolean>
}
