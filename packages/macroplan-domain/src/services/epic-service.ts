import { NotFound, type Product } from '@repo/kernel'
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
 * a colour. `binding` is absent from this interface and that is the point — an epic's binding is the
 * ceiling on what a link holder reaches in Microtask through the bridge, so raising or re-rolling it
 * is `epic:bind`, an admin-only action (ADR 0009), and phase 4 is what writes it. No edit reachable
 * from here may touch it.
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
