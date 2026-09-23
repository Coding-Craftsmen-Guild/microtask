import { NotFound, type Role } from '@repo/kernel'
import type { PlanManifest, PlanShareLink } from '../entities/plan.js'
import { assertWithin, cleanName } from '../limits.js'
import type { PlanContext } from './context.js'
import type { PlanRef } from './refs.js'

/**
 * A seat to mint over one plan.
 *
 * There is no `scope` member, and it is absent because there is nothing for it to say: a plan has
 * exactly one shareable scope, so a seat cannot express a wrong one when it cannot express one at
 * all. `PlanShareLink` stores none either, and `apps/api/src/auth/link-directory.ts` derives
 * `{ kind: 'plan', planId }` from the plan whose manifest the token was found in.
 *
 * `createdBy` is the token of the seat presenting the request, or `null` when the admin is minting
 * it — the caller supplies it from the credential it authenticated, never from a request body, so a
 * seat cannot claim a parent it was not minted through and the revocation cascade keeps describing
 * real lineage (ADR 0010).
 */
export interface NewSeat {
  readonly name: string
  readonly role: Role
  readonly createdBy: string | null
}

/**
 * A new name, a new role, or both. An absent member leaves that field alone.
 *
 * Closed to those two, which is the pair `@repo/contracts`' `UpdateShareLinkPayload` is closed to: a
 * seat's token is what its holder has bookmarked and its `createdBy` is the lineage a revocation
 * walks, so neither is editable. Re-scoping is not listed because a plan seat holds no scope to
 * change — it stays revoke-and-reissue (ADR 0011), as it is in Microtask for a different reason.
 *
 * Both members spell `| undefined` rather than relying on the `?` alone, for the reason
 * `PlanChanges`' members do: under `exactOptionalPropertyTypes` a validated `PATCH` body
 * infers `role?: Role | undefined`, and would otherwise not be assignable here.
 */
export interface SeatChanges {
  readonly name?: string | undefined
  readonly role?: Role | undefined
}

const pickSeat = (manifest: PlanManifest, token: string): PlanShareLink => {
  const found = manifest.shareLinks.find((seat) => seat.token === token)
  if (found === undefined) throw new NotFound('Share link not found')
  return found
}

const revokedBy = (seats: readonly PlanShareLink[], token: string): ReadonlySet<string> => {
  const revoked = new Set([token])
  const frontier = [token]
  for (const parent of frontier) {
    for (const seat of seats) {
      if (seat.createdBy !== parent || revoked.has(seat.token)) continue
      revoked.add(seat.token)
      frontier.push(seat.token)
    }
  }
  return revoked
}

const withSeat = (
  seats: readonly PlanShareLink[],
  next: PlanShareLink,
): readonly PlanShareLink[] => seats.map((seat) => (seat.token === next.token ? next : seat))

const changed = (seat: PlanShareLink, changes: SeatChanges, name?: string): PlanShareLink => ({
  ...seat,
  name: name ?? seat.name,
  role: changes.role ?? seat.role,
})

/**
 * The seats of one plan: minting them, renaming them, and revoking them along with everything
 * minted through them.
 *
 * Every rule here is carried over from `@repo/microtask-domain`'s `ShareLinkService` rather than
 * decided again, because two notions of a seat in one monorepo is how one of them ends up wrong.
 * What genuinely differs is the scope: a Microtask link may be project- or task-scoped and so
 * stores which one it is, while a plan seat has one possible scope and stores none.
 *
 * There is no `list`. A plan's seats arrive with the plan — `planView` carries them for a reader
 * allowed to see them — so a listing method here would be a second place deciding who sees a token.
 */
export class PlanShareLinkService {
  readonly #ctx: PlanContext

  /** Creates the service over an injected context. */
  constructor(ctx: PlanContext) {
    this.#ctx = ctx
  }

  /**
   * Mints a seat over one plan, recording who granted it, and answers it beside the saved plan.
   *
   * The manifest comes back with the seat because the caller's next act is to answer with the plan
   * the seat now belongs to, and re-reading it outside the lock could hand back a later writer's
   * version instead of the one this call produced.
   *
   * `shareLinksPerPlan` is counted inside `lock.run` for the reason `PlanService.create` records
   * about `plansPerProduct`: a count read before the lock lets two concurrent mints at one below
   * the cap both see room and both write.
   */
  async create(
    at: PlanRef,
    seat: NewSeat,
  ): Promise<{ manifest: PlanManifest; link: PlanShareLink }> {
    const name = cleanName(seat.name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      assertWithin('shareLinksPerPlan', current.shareLinks.length)
      const link: PlanShareLink = {
        token: this.#ctx.ids.token(),
        name,
        role: seat.role,
        createdBy: seat.createdBy,
        createdAt: this.#ctx.clock.now(),
      }
      const next = { ...current, shareLinks: [...current.shareLinks, link] }
      return { manifest: await this.#save(at, next), link }
    })
  }

  /**
   * Renames a seat or changes its role, keeping the token its holder has bookmarked (ADR 0035).
   *
   * The name is cleaned with an empty **fallback** rather than a throw, which is the one rule that
   * differs between minting a seat and changing one: `UpdateShareLinkPayload` permits `''` because
   * production data already holds an unnamed link, and a rename that refused one could not save a
   * seat it had just loaded.
   *
   * Nothing re-reads the seat after writing. A holder downgraded mid-session keeps the page it
   * already has, and its next request is resolved against this manifest again — so the new role
   * takes effect on that request and not on this one.
   */
  async update(at: PlanRef, token: string, changes: SeatChanges): Promise<PlanManifest> {
    const name = changes.name === undefined ? undefined : cleanName(changes.name, '')
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      const next = changed(pickSeat(current, token), changes, name)
      return this.#save(at, { ...current, shareLinks: withSeat(current.shareLinks, next) })
    })
  }

  /**
   * Revokes a seat and every seat descended from it through `createdBy` (ADR 0010), answering
   * every token dropped so a caller can say how many went with it.
   *
   * The whole lineage is computed first and written once. Revoking each descendant through its own
   * call would republish the manifest per seat, leaving a half-cut cascade behind any failure part
   * way through — the partly-applied write one manifest write per change exists to rule out
   * (ADR 0006).
   */
  async revoke(
    at: PlanRef,
    token: string,
  ): Promise<{ manifest: PlanManifest; revoked: readonly string[] }> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#manifest(at)
      pickSeat(current, token)
      const gone = revokedBy(current.shareLinks, token)
      const kept = current.shareLinks.filter((seat) => !gone.has(seat.token))
      const revoked = current.shareLinks
        .filter((seat) => gone.has(seat.token))
        .map((seat) => seat.token)
      return { manifest: await this.#save(at, { ...current, shareLinks: kept }), revoked }
    })
  }

  /** Reads the plan or throws NotFound. Takes no lock, so a locked caller may use it. */
  async #manifest(at: PlanRef): Promise<PlanManifest> {
    const found = await this.#ctx.store.readManifest(at.product, at.planId)
    if (found === null) throw new NotFound('Plan not found')
    return found
  }

  /**
   * Records the plan's tokens, then writes the manifest, stamping it as changed.
   *
   * The index goes first because it is the half that can refuse: `add` checks every token before
   * recording any and records nothing when it throws, so a mint colliding with a token some
   * **Microtask project** already holds throws `Conflict` with neither store touched. Writing the
   * manifest first would leave a seat on this plan whose token resolves to somebody else's
   * container — a collision detectable at all only because both products share one index.
   *
   * `add` replaces the plan's whole token set rather than adding to it, so a revocation needs no
   * separate index call: the tokens missing from `next` are exactly the ones it drops. Assumes the
   * caller holds the lock, and answers the stamped manifest so no caller has to re-read it outside
   * one.
   */
  async #save(at: PlanRef, next: PlanManifest): Promise<PlanManifest> {
    const stamped = { ...next, updatedAt: this.#ctx.clock.now() }
    const owner = { product: at.product, containerId: stamped.id }
    this.#ctx.tokens.add(owner, stamped.shareLinks.map((seat) => seat.token))
    await this.#ctx.store.saveManifest(at.product, stamped)
    return stamped
  }
}
