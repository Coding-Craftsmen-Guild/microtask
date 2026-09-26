import { NotFound, type Product } from '@repo/kernel'
import type { PlanFeature } from '../entities/feature.js'
import type { PlanLabel } from '../entities/label.js'
import type { PlanManifest } from '../entities/plan.js'
import { assertWithin, cleanName } from '../limits.js'
import type { PlanContext } from './context.js'
import type { PlanRef } from './refs.js'
import { pickLabel } from './structure-mapper.js'

const DEFAULT_COLOUR = '#7c3aed'

/**
 * What a new label is created from: a name, and optionally the colour its chip is drawn in.
 *
 * `colour` spells `| undefined` beside the `?` for the reason `NewEpic`'s does: under
 * `exactOptionalPropertyTypes` a validated request body infers `colour?: string | undefined`, and would
 * otherwise not be assignable here. Present-and-undefined means what absent means, which is what
 * {@link LabelService.add} reads it as.
 */
export interface NewLabel {
  readonly name: string
  readonly colour?: string | undefined
}

/**
 * What may change about a label. An absent key leaves that field alone.
 *
 * Neither field is nullable, because neither can be cleared: a label always has a name and always has
 * a colour. What *can* be cleared is a feature's membership, and that is a write to the feature rather
 * than to the label — `FeatureService.setLabel` with `null`.
 */
export interface LabelChanges {
  readonly name?: string | undefined
  readonly colour?: string | undefined
}

const applied = (current: PlanLabel, changes: LabelChanges, updatedAt: string): PlanLabel => ({
  ...current,
  name: changes.name !== undefined ? cleanName(changes.name) : current.name,
  colour: changes.colour ?? current.colour,
  updatedAt,
})

const released = (features: readonly PlanFeature[], labelId: string, stamp: string): readonly PlanFeature[] =>
  features.map((each) => (each.labelId === labelId ? { ...each, labelId: null, updatedAt: stamp } : each))

/**
 * Adds, renames, recolours and removes the labels of one plan.
 *
 * A service of its own rather than four methods on `EpicService`, because a label is not a rail and the
 * two would share nothing but the manifest: a rail is a lane work is placed on and a label is a group
 * work belongs to, they are edited on different screens, and every method here touches `features` where
 * no method there does.
 *
 * Nothing in it takes a placement. Labels are ordered by their ids — a ULID opens with its creation
 * millisecond — so there is no `place` to write and no `railOrder` to renumber.
 */
export class LabelService {
  readonly #ctx: PlanContext

  /** Creates the service over an injected context. */
  constructor(ctx: PlanContext) {
    this.#ctx = ctx
  }

  /** Adds a label to the plan, refusing to exceed `labelsPerPlan`. It starts with no members. */
  async add(at: PlanRef, label: NewLabel): Promise<PlanManifest> {
    const name = cleanName(label.name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      assertWithin('labelsPerPlan', current.labels.length)
      const stamp = this.#ctx.clock.now()
      const created: PlanLabel = {
        id: this.#ctx.ids.entityId(),
        name,
        colour: label.colour ?? DEFAULT_COLOUR,
        createdAt: stamp,
        updatedAt: stamp,
      }
      return this.#save(at.product, { ...current, labels: [...current.labels, created] })
    })
  }

  /** Renames a label, recolours it, or both, leaving every feature in it exactly where it is. */
  async update(at: PlanRef, labelId: string, changes: LabelChanges): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      const next = applied(pickLabel(current, labelId), changes, this.#ctx.clock.now())
      const labels = current.labels.map((each) => (each.id === labelId ? next : each))
      return this.#save(at.product, { ...current, labels })
    })
  }

  /**
   * Removes a label and clears it off every feature that was in it, in one write.
   *
   * **It deletes no feature.** That is the difference between this and `EpicService.remove` beside it,
   * and it is the reason this method exists rather than being a line in `withoutEpic`: a rail is where
   * work lives, so removing one removes the work, where a group is a way of seeing work that is
   * somewhere else. A feature whose group is deleted keeps its rail, its estimate, its pin, its edges
   * and its items, and reads as a feature in no group — which is what it now is.
   *
   * No item file is touched either way, so this is a manifest-only write and takes no `deleteItems`
   * call, unlike every other cascade in this package.
   *
   * The features are restamped and the plan is: a feature that was in the deleted group did change,
   * and a reader comparing `updatedAt` to decide whether to re-read would otherwise be told nothing
   * happened to it. Features in no group and features in a different one are left byte-identical.
   */
  async remove(at: PlanRef, labelId: string): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      pickLabel(current, labelId)
      const stamp = this.#ctx.clock.now()
      const labels = current.labels.filter((each) => each.id !== labelId)
      const features = released(current.features, labelId, stamp)
      return this.#save(at.product, { ...current, labels, features })
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
