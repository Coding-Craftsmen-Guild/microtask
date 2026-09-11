import { NotFound } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import { assertWithin, cleanName } from '../limits.js'
import type { ServiceContext } from './context.js'
import type { ProjectRef } from './refs.js'
import {
  assertContained,
  newLink,
  partition,
  pickLink,
  requestedScope,
  revokedBy,
  type ShareLinkRequest,
} from './share-link-mapper.js'

export type { ScopeRequest, ShareLinkRequest } from './share-link-mapper.js'

/**
 * The share links of one project: minting them, listing them, and revoking them along with
 * everything minted through them.
 *
 * There is no method that changes a link's scope, and that is the design rather than an
 * omission: a mutable scope would let a `manage` holder widen its own authority in place, so
 * changing one is revoke-and-reissue (ADR 0011). Delegation is recorded instead — every link
 * remembers the token that minted it, which is what makes cutting a leaked manager cut
 * everything downstream of it (ADR 0010).
 */
export class ShareLinkService {
  readonly #ctx: ServiceContext

  /** Creates the service over an injected context. */
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx
  }

  /**
   * Lists the project's share links, in the order they were minted.
   *
   * Unfiltered on purpose. Which links a principal may see is decided where a project is shaped
   * for its reader, and a second copy of that predicate here is exactly the duplication ADR 0009
   * refuses. Takes no lock, so a locked writer may call it.
   */
  async list(at: ProjectRef): Promise<readonly ShareLink[]> {
    return (await this.#manifest(at)).shareLinks
  }

  /** Mints a link, defaulting it to the task it names and recording who minted it. */
  async create(at: ProjectRef, request: ShareLinkRequest): Promise<ShareLink> {
    const name = cleanName(request.name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      assertWithin('shareLinksPerProject', current.shareLinks.length)
      const scope = requestedScope(current.id, request)
      assertContained(current, scope)
      const stamp = this.#ctx.clock.now()
      const created = newLink(this.#ctx.ids.token(), { ...request, name }, scope, stamp)
      await this.#save(at, { ...current, shareLinks: [...current.shareLinks, created] })
      return created
    })
  }

  /**
   * Revokes a link and every link descended from it through `createdBy` (ADR 0010), returning
   * all of them so a caller can say how many went with it.
   */
  async revoke(at: ProjectRef, token: string): Promise<readonly ShareLink[]> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      pickLink(current, token)
      const { kept, gone } = partition(current.shareLinks, revokedBy(current.shareLinks, token))
      await this.#save(at, { ...current, shareLinks: kept })
      return gone
    })
  }

  /** Reads the project or throws NotFound. Takes no lock, so a locked caller may use it. */
  async #manifest(at: ProjectRef): Promise<ProjectManifest> {
    const found = await this.#ctx.store.readManifest(at.product, at.projectId)
    if (found === null) throw new NotFound('Project not found')
    return found
  }

  /**
   * Records the project's tokens, then writes the manifest, stamping it as changed.
   *
   * The index goes first because it is the half that can refuse: it rejects a token another
   * project already owns and records nothing when it does, so a colliding mint throws `Conflict`
   * with neither store touched. Writing the manifest first would leave a link behind whose token
   * resolves to somebody else's project. Assumes the caller holds the lock.
   */
  async #save(at: ProjectRef, next: ProjectManifest): Promise<void> {
    const stamped = { ...next, updatedAt: this.#ctx.clock.now() }
    this.#ctx.tokens.add(at.product, stamped)
    await this.#ctx.store.saveManifest(at.product, stamped)
  }
}
