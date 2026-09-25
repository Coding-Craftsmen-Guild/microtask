import { NotFound, type Product } from '@repo/kernel'
import type { EpicBinding } from '../entities/binding.js'
import type { PlanEpic } from '../entities/epic.js'
import type { PlanManifest } from '../entities/plan.js'
import { assertWithin, cleanName } from '../limits.js'
import { withoutEpic } from './cascade.js'
import type { PlanContext } from './context.js'
import type { PlanRef } from './refs.js'
import { pickEpic, placedRail } from './structure-mapper.js'

const DEFAULT_COLOUR = '#3355ff'

/**
 * What a new rail is created from. A new rail is bound to nothing.
 *
 * `colour` is optional and falls back to one fixed value rather than to a rotating palette: a
 * palette would decide what the canvas looks like from inside the domain, and rail colour becomes a
 * visual decision in phase 2. A caller that wants a hue sends one.
 *
 * It spells `| undefined` rather than relying on the `?` alone, for the reason
 * `@repo/microtask-domain`'s `ScopeRequest` and this package's own `NewPlan` already record:
 * under `exactOptionalPropertyTypes` a validated request body infers `colour?: string | undefined`,
 * and would otherwise not be assignable here. Present-and-undefined means the same thing as absent,
 * which is what {@link EpicService.add} reads it as.
 */
export interface NewEpic {
  readonly name: string
  readonly colour?: string | undefined
}

/**
 * What may change about a rail. An absent key leaves that field alone.
 *
 * Neither field is nullable, because neither can be cleared: a rail always has a name and always has
 * a colour. `binding` is absent from this interface and that is the point — a binding's **role** is
 * the ceiling on everything a link holder reaches in Microtask through the phase-4 bridge, so a
 * holder who could re-role one would raise its own ceiling and every bound rail would be decoration.
 * That, and not the absence of a target, is why raising or re-rolling it is `epic:bind` and why that
 * action is admin-only (ADR 0053); phase 4 is what writes it (spec §9). No edit reachable from here
 * may touch it.
 *
 * Both members spell `| undefined` for the reason {@link NewEpic}'s `colour` does: a validated
 * `PATCH` body infers `name?: string | undefined`, and {@link EpicService.update} treats
 * present-and-undefined exactly as it treats absent.
 */
export interface EpicChanges {
  readonly name?: string | undefined
  readonly colour?: string | undefined
}

const applied = (current: PlanEpic, changes: EpicChanges, updatedAt: string): PlanEpic => ({
  ...current,
  name: changes.name !== undefined ? cleanName(changes.name) : current.name,
  colour: changes.colour ?? current.colour,
  updatedAt,
})

/** Adds, edits, reorders and removes the rails of one plan. */
export class EpicService {
  readonly #ctx: PlanContext

  /** Creates the service over an injected context. */
  constructor(ctx: PlanContext) {
    this.#ctx = ctx
  }

  /**
   * Adds a rail at the bottom of the plan, refusing to exceed `epicsPerPlan`.
   *
   * Bottom rather than a position the caller chose, because work is added in the order it is
   * discovered (spec §6) and `add` therefore takes no placement at all. Moving it is `place`.
   */
  async add(at: PlanRef, epic: NewEpic): Promise<PlanManifest> {
    const name = cleanName(epic.name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      assertWithin('epicsPerPlan', current.epics.length)
      const stamp = this.#ctx.clock.now()
      const created: PlanEpic = {
        id: this.#ctx.ids.entityId(),
        name,
        colour: epic.colour ?? DEFAULT_COLOUR,
        railOrder: current.epics.length,
        binding: null,
        createdAt: stamp,
        updatedAt: stamp,
      }
      return this.#save(at.product, { ...current, epics: [...current.epics, created] })
    })
  }

  /** Renames a rail, recolours it, or both, moving nothing and leaving its binding alone. */
  async update(at: PlanRef, epicId: string, changes: EpicChanges): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      const next = applied(pickEpic(current, epicId), changes, this.#ctx.clock.now())
      const epics = current.epics.map((each) => (each.id === epicId ? next : each))
      return this.#save(at.product, { ...current, epics })
    })
  }

  /**
   * Moves one rail to a rail order, renumbering the rails densely and moving no other rail.
   *
   * The features on every rail, this one included, keep the positions they had: a rail order says
   * where a lane is drawn, and nothing inside a lane depends on which lane it is.
   */
  async place(at: PlanRef, epicId: string, railOrder: number): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      pickEpic(current, epicId)
      const epics = placedRail(current.epics, epicId, railOrder)
      return this.#save(at.product, { ...current, epics })
    })
  }

  /**
   * Binds a rail to one Microtask project, replacing whatever binding it already held.
   *
   * Stores `binding` verbatim, sealed token included, and verifies none of it: verifying a token
   * means resolving it against Microtask, and this package cannot reach Microtask — only
   * `apps/api` can (design §7.2). A method here that pretended to check would be lying about what
   * it checked, which is worse than not checking at all: a caller reading "bind succeeded" would
   * take it as proof of a live, correctly-scoped token, and it would be proof of nothing. The
   * route is where a dead or revoked token is actually discovered, at the moment a bound epic is
   * read, exactly as spec §7.2's "a revoked or dead token renders the epic unlinked" describes.
   *
   * Binding an already-bound rail **replaces** the stored binding rather than refusing a second
   * call or merging one field at a time: re-rolling a rail from `view` to `manage` and re-pasting
   * a rotated token for the same project are the same operation from where this method stands —
   * one write of the whole {@link EpicBinding} — and treating them differently would need this
   * method to inspect which fields changed and decide what that means, which is exactly the
   * verification the paragraph above says it must not do.
   */
  async bind(at: PlanRef, epicId: string, binding: EpicBinding): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      pickEpic(current, epicId)
      const stamp = this.#ctx.clock.now()
      const epics = current.epics.map((each) =>
        each.id === epicId ? { ...each, binding, updatedAt: stamp } : each,
      )
      return this.#save(at.product, { ...current, epics })
    })
  }

  /**
   * Unbinds a rail, setting its binding to `null`. Idempotent: unbinding a rail that is already
   * unbound raises nothing and **writes nothing** — it answers the manifest exactly as it found it.
   *
   * Returning early rather than saving an identical manifest, because {@link EpicService.#save}
   * stamps the plan's own `updatedAt` on every write and a plan list is ordered by it (`PlanList`
   * is "every plan a caller may be told about, most recently updated first"). So a second `DELETE`
   * that stamped would move the plan to the top of that list to report that nothing happened, and
   * a client retrying a delete it was unsure landed would reorder somebody's screen. The route this
   * sits behind refuses an epic `PATCH` with an empty body for the same reason — "a request asking
   * for nothing is a 422 rather than a write that stamps `updatedAt` and changes nothing" — and an
   * idempotent delete is the one shape that cannot express that refusal, since answering twice is
   * the whole point of it. The unknown-epic check still runs first, so a `DELETE` naming a rail
   * that does not exist raises rather than quietly succeeding.
   *
   * **Leaves every item's `linkedTaskId` exactly as it was, everywhere in the plan.** This is the
   * one behaviour here most likely to be mistaken later for an oversight and "fixed" — do not.
   * A binding is permitted no delete (spec §7.2's write path is "exactly one operation — create a
   * task in the bound project", nothing else), and nulling links on unbind would be destruction
   * nobody asked for. It is also what makes re-binding useful rather than merely harmless: an
   * admin who unbinds and rebinds the same rail to the same project — say, after rotating a
   * revoked token — finds every item still pointing at the task it pointed at before, instead of
   * relinking each one by hand because unbinding quietly cleared them.
   */
  async unbind(at: PlanRef, epicId: string): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      if (pickEpic(current, epicId).binding === null) return current
      const stamp = this.#ctx.clock.now()
      const epics = current.epics.map((each) =>
        each.id === epicId ? { ...each, binding: null, updatedAt: stamp } : each,
      )
      return this.#save(at.product, { ...current, epics })
    })
  }

  /**
   * Removes a rail, the features on it and the items under those, in one write.
   *
   * Every removed item file goes out in the single `deleteItems` call the port takes a list for: a
   * loop of single deletes would republish the manifest once per item, and an interrupted epic
   * delete would then leave the plan half-removed in the manifest, which is the state ADR 0006
   * exists to prevent. The call is made even when the rail held no items, so a delete is one write
   * whatever the rail was carrying.
   */
  async remove(at: PlanRef, epicId: string): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      pickEpic(current, epicId)
      const { manifest, itemIds } = withoutEpic(current, epicId)
      const next = { ...manifest, updatedAt: this.#ctx.clock.now() }
      await this.#ctx.store.deleteItems(at.product, next, itemIds)
      return next
    })
  }

  /** Reads the plan or throws NotFound. Takes no lock, so a locked caller may use it. */
  async #read(at: PlanRef): Promise<PlanManifest> {
    const found = await this.#ctx.store.readManifest(at.product, at.planId)
    if (found === null) throw new NotFound('Plan not found')
    return found
  }

  /** Writes the manifest, stamping the plan as changed. Assumes the caller holds the lock. */
  async #save(product: Product, next: PlanManifest): Promise<PlanManifest> {
    const stamped = { ...next, updatedAt: this.#ctx.clock.now() }
    await this.#ctx.store.saveManifest(product, stamped)
    return stamped
  }
}
