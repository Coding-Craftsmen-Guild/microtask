import { NotFound, type Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import { assertWithin, cleanName } from '../limits.js'
import type { ServiceContext } from './context.js'
import type { ProjectRef } from './refs.js'

/** Creates, reads, renames and removes projects. */
export class ProjectService {
  readonly #ctx: ServiceContext

  /** Creates the service over an injected context. */
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx
  }

  /**
   * Lists every project for a product, newest update first.
   *
   * Takes a bare product rather than a ref: there is no one project to name.
   */
  async list(product: Product): Promise<readonly ProjectManifest[]> {
    return this.#ctx.store.listManifests(product)
  }

  /** Reads one project, or throws NotFound. Takes no lock, so a locked writer may call it. */
  async read(at: ProjectRef): Promise<ProjectManifest> {
    const found = await this.#ctx.store.readManifest(at.product, at.projectId)
    if (found === null) throw new NotFound('Project not found')
    return found
  }

  /**
   * Creates an empty project, refusing to exceed the projects-per-product cap.
   *
   * Takes a bare product rather than a ref: the project being named does not exist yet, and its
   * id is this method's result rather than its argument.
   */
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
  async rename(at: ProjectRef, name: string): Promise<ProjectManifest> {
    const cleaned = cleanName(name)
    return this.#ctx.lock.run(async () => {
      const current = await this.read(at)
      const next: ProjectManifest = { ...current, name: cleaned, updatedAt: this.#ctx.clock.now() }
      await this.#ctx.store.saveManifest(at.product, next)
      return next
    })
  }

  /** Removes a project, everything under it, and the share tokens that pointed at it. */
  async remove(at: ProjectRef): Promise<void> {
    await this.#ctx.lock.run(async () => {
      const removed = await this.#ctx.store.deleteProject(at.product, at.projectId)
      if (!removed) throw new NotFound('Project not found')
      this.#ctx.tokens.removeProject(at.product, at.projectId)
    })
  }
}
