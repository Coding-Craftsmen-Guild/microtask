import type { Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'

/**
 * A whole project as one value: its manifest and a document for every task the manifest names.
 *
 * The structural twin of `ConvertedProject`, stated here rather than imported so the port does
 * not depend on the import subsystem — a bulk import hands one of those straight over, and a
 * caller building a project some other way needs nothing from `src/import/` to do it.
 */
export interface WholeProject {
  readonly manifest: ProjectManifest
  readonly documents: readonly TaskDocument[]
}

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

  /**
   * Replaces a whole project — its manifest and every task it names — in one operation, so a
   * reader sees it **wholly absent or wholly present** and never a manifest naming a task that
   * is not there.
   *
   * This is ADR 0006's bulk rule rather than its per-write one: *"A bulk import writes many files
   * at once, so it stages into a temporary directory and moves the project directory into place
   * as its final step."* It exists because the per-write rule does not compose. Building a live
   * project with `saveTask` in a loop republishes the manifest on every call, so the first task
   * file publishes a manifest naming all N tasks; for a project whose share tokens are preserved
   * and therefore already live, every not-yet-written task 404s for the length of the import, and
   * a failure on task 7 of 20 leaves entries pointing at files that are not there.
   *
   * It is a **replace**: a task the project held and this project does not name is gone
   * afterwards. That is what an import's conflict `replace` means, and it is why
   * `Replacement.removedTaskIds` is reported rather than applied — a project published this way
   * drops those files by construction, with no `deleteTask` per id.
   *
   * There is no partial success. A failure leaves the project as it was, **except** in the
   * instant an implementation needs to clear an occupied destination; an implementation states
   * its own window.
   */
  publishProject(product: Product, project: WholeProject): Promise<void>

  /** Removes a project and everything under it, reporting whether it existed. */
  deleteProject(product: Product, projectId: string): Promise<boolean>
}
