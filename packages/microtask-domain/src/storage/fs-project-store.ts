import { Conflict, isUlid, type FileSystem, type Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ProjectStore, WholeProject } from '../ports/project-store.js'
import type { TaskDocument } from '../entities/task.js'
import {
  buildDir,
  buildManifestFile,
  buildTaskFile,
  manifestFile,
  projectDir,
  projectsDir,
  taskFile,
} from './paths.js'

const interrupted = (projectId: string): string =>
  `Not published: the live directory was already cleared, so this project is gone. A complete copy is at build/${projectId}/ under the data root; rename it into place to publish it.`

const halfCleared = (projectId: string): string =>
  `Not published: clearing projects/${projectId}/ failed partway, so that project may be partly removed — a manifest can outlive its task files. Inspect it before importing again.`

/** How an FsProjectStore reaches the disk and where it puts its data. */
export interface FsProjectStoreOptions {
  readonly files: FileSystem
  readonly root: () => string
}

/** A ProjectStore over plain JSON files, one directory per project. */
export class FsProjectStore implements ProjectStore {
  readonly #files: FileSystem
  readonly #root: () => string

  /** Creates a store that reads its data root afresh on every call. */
  constructor(options: FsProjectStoreOptions) {
    this.#files = options.files
    this.#root = options.root
  }

  /** Reads every project manifest, newest update first. */
  async listManifests(product: Product): Promise<readonly ProjectManifest[]> {
    const ids = await this.#files.listDirs(projectsDir(this.#root(), product))
    const found: ProjectManifest[] = []
    for (const id of ids) {
      if (!isUlid(id)) continue
      const manifest = await this.readManifest(product, id)
      if (manifest) found.push(manifest)
    }
    return found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /** Reads one project manifest, or null when the project does not exist. */
  async readManifest(product: Product, projectId: string): Promise<ProjectManifest | null> {
    return this.#readJson<ProjectManifest>(manifestFile(this.#root(), product, projectId))
  }

  /** Reads one task's tabs, or null when the task file is missing or unreadable. */
  async readTask(
    product: Product,
    projectId: string,
    taskId: string,
  ): Promise<TaskDocument | null> {
    return this.#readJson<TaskDocument>(taskFile(this.#root(), product, projectId, taskId))
  }

  /** Writes the manifest alone, for changes that touch no task file. */
  async saveManifest(product: Product, manifest: ProjectManifest): Promise<void> {
    await this.#writeJson(manifestFile(this.#root(), product, manifest.id), manifest)
  }

  /** Writes the task file, then the manifest, so a crash can only orphan a file. */
  async saveTask(
    product: Product,
    manifest: ProjectManifest,
    task: TaskDocument,
  ): Promise<void> {
    await this.#writeJson(taskFile(this.#root(), product, manifest.id, task.id), task)
    await this.saveManifest(product, manifest)
  }

  /** Writes the manifest, then unlinks the task file, in that order. */
  async deleteTask(
    product: Product,
    manifest: ProjectManifest,
    taskId: string,
  ): Promise<void> {
    await this.saveManifest(product, manifest)
    await this.#files.remove(taskFile(this.#root(), product, manifest.id, taskId))
  }

  /**
   * Assembles the whole project in `build/<id>/` and renames it onto `projects/<id>/`.
   *
   * ADR 0006's bulk rule, and the rename is what makes it one step: a directory rename is atomic
   * on both platforms, so `listManifests` sees the project wholly absent or wholly present and
   * never a manifest naming a task file the loop had not reached. `build/` is a sibling of
   * `projects/` under the same data root precisely so this is a rename and not a copy (ADR 0045).
   *
   * **The window in which neither copy is in place.** `move` requires an absent destination — it
   * probes with `lstat` and refuses anything there, of either kind — and a live project occupies
   * it. Measured on win32 / Node 22.16, leaving it to the platform is not an option: a directory
   * rename onto a non-empty destination gives `EPERM`, onto an *empty* one `EPERM` as well where
   * POSIX succeeds, and a bare `fs.rename` onto a destination **file** silently replaces it. So
   * the destination is cleared first, and between that `removeDir` and the `move` completing
   * there is an instant in which the project is in neither place. A kill there leaves it
   * **wholly absent** rather than half-written, which is the invariant this method promises; the
   * assembled copy is still in `build/<id>/`, and the drop the admin dropped is still theirs.
   * Clearing is preferred over moving the live copy aside because the recovery state is better:
   * what survives in `build/` is the project they asked for, not the one they replaced.
   *
   * **Three regions, and what an operator is told differs in each**, which is the whole reason
   * this method catches anything. Up to and including the build writes, a failure leaves the
   * project exactly as it was: the caller needs to know nothing but that it failed, and that
   * failure is left unwrapped.
   *
   * **The clear is its own region and is not part of the build.** `removeDir` is `rm -rf`, not an
   * atomic operation — it unlinks children and then the directory — so a throw partway (a locked
   * file, an ACL, `EBUSY` once the retries are spent: the same win32 conditions the retry
   * paragraph below names) leaves the live project **partly removed**, with a manifest that can
   * outlive its own task files and that `listManifests` will keep listing. Reporting that as an
   * ordinary failure would tell an operator the project already there is untouched, which is
   * false in the destructive direction, so it is wrapped in a `Conflict` naming `projects/<id>/`
   * and saying it may be partly removed. It deliberately does **not** suggest a rename: the
   * incoming copy in `build/<id>/` is the *incoming* project, not the one being damaged, and a
   * rename onto a destination that is still occupied is exactly what just failed.
   *
   * **A failed rename is the third region**, and there the project is **gone** — ADR 0045's
   * amendment requires an operator be told rather than left to infer it, so that `Conflict` names
   * `build/<id>/`, which is where the complete, correctly-laid-out copy is and which a rename by
   * hand does publish. Both sentences name their directory **relative to the data root** rather
   * than absolutely: a project id is 26 characters, so they measure 192 and 190 and are always
   * inside the 200 a preview row may carry, where an absolute path could be elided through its
   * own middle — and the container layout is not something a response should carry anyway.
   *
   * `Conflict` for both, because it is the error class this repo writes *for a caller to read*
   * (`apply-outcome.ts` echoes an `AppError`'s message and suppresses every other), and because
   * "the store is not in a state where this could complete" is what it means. The status it
   * carries is never reached: every caller is a bulk import that catches this per project. The
   * underlying cause is attached as `error.cause` rather than quoted, so the platform's own
   * message stays out of a response and reaches the process log instead.
   *
   * ADR 0045 said a build directory is removed on both paths out; its 2026-09-16 amendment
   * corrects that to the way **in**, which is what this does. Removing it on the failure path
   * would destroy the only copy of a project whose destination had just been cleared, which is
   * the one outcome ADR 0006 calls the worst. Clearing on entry reclaims whatever an interrupted
   * publish left and bounds the residue at one directory per project id.
   *
   * **Nothing retries.** Neither `move` nor `removeDir` retries in the port, a directory rename
   * is a classic transient `EPERM`/`EBUSY` on win32 under a watcher or an anti-virus scanner, and
   * this is the one call where a transient failure loses a project — so the decision is stated
   * rather than left implicit. `NodeFileSystem.removeDir` passes Node's own `maxRetries`, which
   * covers the clearing half at no cost. The rename half is **not** retried here: a retry needs
   * elapsed time to be worth anything, every caller of this runs inside the process-wide write
   * lock where that time is time every other write in the API waits, and the port forbids
   * switching on an error code — so a retry could not tell a transient `EPERM` from the
   * deterministic `EEXIST` or `ENOSPC` it would then spend the same delay on. The failure is
   * reported instead, per project, which is what a bulk import's outcome list is for.
   */
  async publishProject(product: Product, project: WholeProject): Promise<void> {
    const root = this.#root()
    const id = project.manifest.id
    const build = buildDir(root, product, id)
    await this.#files.removeDir(build)
    for (const document of project.documents) {
      await this.#writeJson(buildTaskFile(root, product, id, document.id), document)
    }
    await this.#writeJson(buildManifestFile(root, product, id), project.manifest)
    const live = projectDir(root, product, id)
    try {
      await this.#files.removeDir(live)
    } catch (cause) {
      throw Object.assign(new Conflict(halfCleared(id)), { cause })
    }
    try {
      await this.#files.move(build, live)
    } catch (cause) {
      throw Object.assign(new Conflict(interrupted(id)), { cause })
    }
  }

  /** Removes a project and everything under it, reporting whether it existed. */
  async deleteProject(product: Product, projectId: string): Promise<boolean> {
    return this.#files.removeDir(projectDir(this.#root(), product, projectId))
  }

  async #readJson<T>(file: string): Promise<T | null> {
    const raw = await this.#files.readText(file)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async #writeJson(file: string, value: unknown): Promise<void> {
    await this.#files.writeTextAtomic(file, JSON.stringify(value, null, 2))
  }
}
