import { isUlid, type FileSystem, type Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ProjectStore } from '../ports/project-store.js'
import type { TaskDocument } from '../entities/task.js'
import { manifestFile, projectDir, projectsDir, taskFile } from './paths.js'

/** How an FsProjectStore reaches the disk and where it puts its data. */
export interface FsProjectStoreOptions {
  files: FileSystem
  root: () => string
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
