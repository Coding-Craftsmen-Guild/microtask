import { Invalid, isProduct, isUlid, type Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ProjectStore } from '../ports/project-store.js'
import type { TaskDocument } from '../entities/task.js'

const containerKey = (product: Product, name: string): string => `${product}/${name}`

const taskKey = (product: Product, projectId: string, taskId: string): string =>
  `${containerKey(product, projectId)}/${taskId}`

function assertProduct(product: Product): void {
  if (!isProduct(product)) throw new Invalid('Unknown product')
}

function assertIds(product: Product, projectId: string, taskId?: string): void {
  assertProduct(product)
  if (!isUlid(projectId)) throw new Invalid('Project id must be a ULID')
  if (taskId !== undefined && !isUlid(taskId)) throw new Invalid('Task id must be a ULID')
}

function parseOrNull<T>(raw: string | undefined): T | null {
  if (raw === undefined) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * A ProjectStore keeping serialised JSON in memory, so a service test never touches a disk.
 *
 * Values are stored as strings rather than objects on purpose: every read parses afresh and
 * every write serialises, so the store is the same value boundary the filesystem adapter is.
 * A caller that mutates a manifest it was handed cannot reach back into the store, which is
 * what keeps the two adapters interchangeable rather than merely similar.
 */
export class MemoryProjectStore implements ProjectStore {
  readonly #containers = new Set<string>()
  readonly #manifests = new Map<string, string>()
  readonly #tasks = new Map<string, string>()

  /** Discards every project, so each case in a suite starts from nothing. */
  clear(): void {
    this.#containers.clear()
    this.#manifests.clear()
    this.#tasks.clear()
  }

  /** Plants bytes where a task's JSON belongs, bypassing this store's own serialisation. */
  putRawTask(product: Product, projectId: string, taskId: string, raw: string): void {
    this.#containers.add(containerKey(product, projectId))
    this.#tasks.set(taskKey(product, projectId, taskId), raw)
  }

  /** Adds a container under any name, modelling a project container holding no manifest. */
  addContainer(product: Product, name: string): void {
    this.#containers.add(containerKey(product, name))
  }

  /** Reads every project manifest, newest update first. */
  async listManifests(product: Product): Promise<readonly ProjectManifest[]> {
    assertProduct(product)
    const found: ProjectManifest[] = []
    for (const id of this.#names(product)) {
      if (!isUlid(id)) continue
      const manifest = await this.readManifest(product, id)
      if (manifest) found.push(manifest)
    }
    return found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  /** Reads one project manifest, or null when the project does not exist. */
  async readManifest(product: Product, projectId: string): Promise<ProjectManifest | null> {
    assertIds(product, projectId)
    return parseOrNull<ProjectManifest>(this.#manifests.get(containerKey(product, projectId)))
  }

  /** Reads one task's tabs, or null when the task is missing or unparseable. */
  async readTask(
    product: Product,
    projectId: string,
    taskId: string,
  ): Promise<TaskDocument | null> {
    assertIds(product, projectId, taskId)
    return parseOrNull<TaskDocument>(this.#tasks.get(taskKey(product, projectId, taskId)))
  }

  /** Writes the manifest alone, for changes that touch no task. */
  async saveManifest(product: Product, manifest: ProjectManifest): Promise<void> {
    assertIds(product, manifest.id)
    this.#containers.add(containerKey(product, manifest.id))
    this.#manifests.set(containerKey(product, manifest.id), JSON.stringify(manifest))
  }

  /** Writes the task, then the manifest, matching the order the port documents. */
  async saveTask(product: Product, manifest: ProjectManifest, task: TaskDocument): Promise<void> {
    assertIds(product, manifest.id, task.id)
    this.#tasks.set(taskKey(product, manifest.id, task.id), JSON.stringify(task))
    await this.saveManifest(product, manifest)
  }

  /** Writes the manifest, then drops the task, matching the order the port documents. */
  async deleteTask(product: Product, manifest: ProjectManifest, taskId: string): Promise<void> {
    assertIds(product, manifest.id, taskId)
    await this.saveManifest(product, manifest)
    this.#tasks.delete(taskKey(product, manifest.id, taskId))
  }

  /** Removes a project and everything under it, reporting whether it existed. */
  async deleteProject(product: Product, projectId: string): Promise<boolean> {
    assertIds(product, projectId)
    const at = containerKey(product, projectId)
    const existed = this.#containers.delete(at)
    this.#manifests.delete(at)
    for (const key of [...this.#tasks.keys()]) {
      if (key.startsWith(`${at}/`)) this.#tasks.delete(key)
    }
    return existed
  }

  *#names(product: Product): Generator<string> {
    const prefix = `${product}/`
    for (const at of this.#containers) {
      if (at.startsWith(prefix)) yield at.slice(prefix.length)
    }
  }
}
