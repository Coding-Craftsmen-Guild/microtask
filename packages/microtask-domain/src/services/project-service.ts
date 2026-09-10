import { NotFound, type Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import { assertWithin, cleanName } from '../limits.js'
import type { ServiceContext } from './context.js'

/** Creates, reads, renames and removes projects. */
export class ProjectService {
  readonly #ctx: ServiceContext

  /** Creates the service over an injected context. */
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx
  }

  /** Lists every project for a product, newest update first. */
  async list(product: Product): Promise<readonly ProjectManifest[]> {
    return this.#ctx.store.listManifests(product)
  }

  /** Reads one project, or throws NotFound. Takes no lock, so a locked writer may call it. */
  async read(product: Product, projectId: string): Promise<ProjectManifest> {
    const found = await this.#ctx.store.readManifest(product, projectId)
    if (found === null) throw new NotFound('Project not found')
    return found
  }

  /** Creates an empty project, refusing to exceed the projects-per-product cap. */
  async create(product: Product, name: string): Promise<ProjectManifest> {
    const cleaned = cleanName(name)
    return this.#ctx.lock.run(async () => {
      const existing = await this.#ctx.store.listManifests(product)
      assertWithin('projectsPerProduct', existing.length)
      const stamp = this.#ctx.clock.now()
      const manifest: ProjectManifest = {
        id: this.#ctx.ids.entityId(),
        name: cleaned,
        folders: [],
        tasks: [],
        shareLinks: [],
        createdAt: stamp,
        updatedAt: stamp,
      }
      await this.#ctx.store.saveManifest(product, manifest)
      return manifest
    })
  }

  /** Renames a project, leaving everything under it alone. */
  async rename(product: Product, projectId: string, name: string): Promise<ProjectManifest> {
    const cleaned = cleanName(name)
    return this.#ctx.lock.run(async () => {
      const current = await this.read(product, projectId)
      const next: ProjectManifest = { ...current, name: cleaned, updatedAt: this.#ctx.clock.now() }
      await this.#ctx.store.saveManifest(product, next)
      return next
    })
  }

  /** Removes a project, everything under it, and the share tokens that pointed at it. */
  async remove(product: Product, projectId: string): Promise<void> {
    await this.#ctx.lock.run(async () => {
      const removed = await this.#ctx.store.deleteProject(product, projectId)
      if (!removed) throw new NotFound('Project not found')
      this.#ctx.tokens.removeProject(product, projectId)
    })
  }
}
