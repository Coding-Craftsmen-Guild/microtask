import { NotFound, type Product } from '@repo/kernel'
import type { Folder } from '../entities/folder.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import { assertWithin, cleanName } from '../limits.js'
import type { ServiceContext } from './context.js'
import { densified, inOrder, reordered } from './positions.js'
import type { ProjectRef } from './refs.js'

const pick = (folders: readonly Folder[], folderId: string): Folder => {
  const found = folders.find((folder) => folder.id === folderId)
  if (found === undefined) throw new NotFound('Folder not found')
  return found
}

const movedToRoot = (tasks: readonly TaskEntry[], folderId: string): readonly TaskEntry[] => {
  const elsewhere = tasks.filter((task) => task.folderId !== null && task.folderId !== folderId)
  const atRoot = inOrder(tasks.filter((task) => task.folderId === null))
  const held = inOrder(tasks.filter((task) => task.folderId === folderId))
  const root = [...atRoot, ...held].map((task, index) => ({ ...task, folderId: null, position: index }))
  return [...elsewhere, ...root]
}

/**
 * The one flat level of folders a project has.
 *
 * A folder groups tasks and nothing else: it has no parent, nothing here accepts one, and a
 * folder holds no content of its own — which is why removing one moves its tasks to the project
 * root rather than deleting anything.
 */
export class FolderService {
  readonly #ctx: ServiceContext

  /** Creates the service over an injected context. */
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx
  }

  /** Lists a project's folders in order. Takes no lock, so a locked writer may call it. */
  async list(at: ProjectRef): Promise<readonly Folder[]> {
    const current = await this.#manifest(at)
    return inOrder(current.folders)
  }

  /** Creates a folder at the end of the order, refusing to exceed the per-project cap. */
  async create(at: ProjectRef, name: string): Promise<Folder> {
    const cleaned = cleanName(name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      assertWithin('foldersPerProject', current.folders.length)
      const stamp = this.#ctx.clock.now()
      const created: Folder = {
        id: this.#ctx.ids.entityId(),
        name: cleaned,
        position: current.folders.length,
        createdAt: stamp,
        updatedAt: stamp,
      }
      await this.#save(at.product, { ...current, folders: [...current.folders, created] })
      return created
    })
  }

  /** Renames a folder, leaving its place in the order and the tasks inside it alone. */
  async rename(at: ProjectRef, folderId: string, name: string): Promise<Folder> {
    const cleaned = cleanName(name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      const found = pick(current.folders, folderId)
      const next: Folder = { ...found, name: cleaned, updatedAt: this.#ctx.clock.now() }
      const folders = current.folders.map((folder) => (folder.id === folderId ? next : folder))
      await this.#save(at.product, { ...current, folders })
      return next
    })
  }

  /** Removes a folder, moving the tasks it held to the project root rather than deleting them. */
  async remove(at: ProjectRef, folderId: string): Promise<void> {
    await this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      pick(current.folders, folderId)
      await this.#save(at.product, {
        ...current,
        folders: densified(current.folders.filter((folder) => folder.id !== folderId)),
        tasks: movedToRoot(current.tasks, folderId),
      })
    })
  }

  /** Renumbers the folders into the order given, which must name each of them exactly once. */
  async reorder(at: ProjectRef, folderIds: readonly string[]): Promise<readonly Folder[]> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      const folders = reordered(current.folders, folderIds, 'folder')
      await this.#save(at.product, { ...current, folders })
      return folders
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
}
