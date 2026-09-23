import { Conflict, Invalid, NotFound, type Product } from '@repo/kernel'
import { findCycles } from '@repo/schedule'
import type { PlanFeature } from '../entities/feature.js'
import type { PlanManifest } from '../entities/plan.js'
import { assertWithin, cleanName } from '../limits.js'
import { withoutFeatures } from './cascade.js'
import type { PlanContext } from './context.js'
import { placeAmong } from './positions.js'
import type { PlanRef } from './refs.js'
import { assertEpic, assertFeature, densifiedFeatures, pickFeature, railFeatures } from './structure-mapper.js'

/**
 * What a new feature is created from. It starts with no dependencies at all.
 *
 * The two optional members spell `| undefined` beside their `null`, for the reason
 * `@repo/microtask-domain`'s `ScopeRequest` and this package's own `NewPlan` already record: under
 * `exactOptionalPropertyTypes` a validated request body infers
 * `estimateDays?: number | null | undefined`, and would otherwise not be assignable here. The three
 * spellings are two meanings — `undefined` and absent both mean "say nothing", `null` means "no
 * estimate" — which is what the `?? null` in {@link FeatureService.add} reads them as.
 */
export interface NewFeature {
  readonly epicId: string
  readonly name: string
  readonly estimateDays?: number | null | undefined
  readonly pinSprint?: number | null | undefined
}

/**
 * What may change about a feature. An absent key leaves the field; `null` clears it.
 *
 * Both nullable fields need both spellings. Zero is a real estimate — a milestone that takes no
 * time — and sprint zero is a real pin, so neither "not estimated yet" nor "not pinned" can be
 * written as a falsy value, and collapsing absent and `null` into one optional would leave "clear
 * it" with no spelling of its own. `dependsOn` is absent here: replacing an edge list is checked
 * against the plan-wide edge budget and refused when it closes a cycle, which is a different
 * operation and is {@link FeatureService.setDependencies}.
 *
 * Every member spells `| undefined` for the reason {@link NewFeature}'s two do: a validated `PATCH`
 * body infers `name?: string | undefined`, and {@link FeatureService.update} tests each key against
 * `undefined`, so present-and-undefined leaves the field exactly as absent does.
 */
export interface FeatureChanges {
  readonly name?: string | undefined
  readonly estimateDays?: number | null | undefined
  readonly pinSprint?: number | null | undefined
}

/** Where a feature is going: which rail, and where along it. */
export interface FeaturePlacement {
  readonly epicId: string
  readonly position: number
}

const applied = (
  current: PlanFeature,
  changes: FeatureChanges,
  updatedAt: string,
): PlanFeature => ({
  ...current,
  name: changes.name !== undefined ? cleanName(changes.name) : current.name,
  estimateDays: changes.estimateDays !== undefined ? changes.estimateDays : current.estimateDays,
  pinSprint: changes.pinSprint !== undefined ? changes.pinSprint : current.pinSprint,
  updatedAt,
})

const edgeTotal = (features: readonly PlanFeature[]): number =>
  features.reduce((running, each) => running + each.dependsOn.length, 0)

function assertEdgesExist(
  manifest: PlanManifest,
  featureId: string,
  dependsOn: readonly string[],
): void {
  for (const id of dependsOn) {
    if (id === featureId) throw new Invalid('A feature cannot depend on itself')
    assertFeature(manifest, id)
  }
}

function assertAcyclic(features: readonly PlanFeature[]): void {
  const cycles = findCycles(features)
  if (cycles.length === 0) return
  const named = cycles.map((cycle) => cycle.featureIds.join(', ')).join('; ')
  throw new Conflict(`These features would wait on each other: ${named}`)
}

/** Adds, edits, moves, re-points and removes the features of one plan. */
export class FeatureService {
  readonly #ctx: PlanContext

  /** Creates the service over an injected context. */
  constructor(ctx: PlanContext) {
    this.#ctx = ctx
  }

  /** Adds a feature after the last one on its rail, refusing to exceed `featuresPerPlan`. */
  async add(at: PlanRef, feature: NewFeature): Promise<PlanManifest> {
    const name = cleanName(feature.name)
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      assertEpic(current, feature.epicId)
      assertWithin('featuresPerPlan', current.features.length)
      const stamp = this.#ctx.clock.now()
      const created: PlanFeature = {
        id: this.#ctx.ids.entityId(),
        epicId: feature.epicId,
        name,
        position: railFeatures(current, feature.epicId).length,
        estimateDays: feature.estimateDays ?? null,
        pinSprint: feature.pinSprint ?? null,
        dependsOn: [],
        createdAt: stamp,
        updatedAt: stamp,
      }
      return this.#save(at.product, { ...current, features: [...current.features, created] })
    })
  }

  /** Renames a feature, re-estimates it or re-pins it, moving nothing and touching no edge. */
  async update(at: PlanRef, featureId: string, changes: FeatureChanges): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      const next = applied(pickFeature(current, featureId), changes, this.#ctx.clock.now())
      const features = current.features.map((each) => (each.id === featureId ? next : each))
      return this.#save(at.product, { ...current, features })
    })
  }

  /**
   * Moves one feature along its rail or to another, renumbering both rails densely.
   *
   * Carries the feature whole: its estimate, its pin and its dependencies cross a rail boundary
   * untouched, because none of the three is a property of the rail it sat on. Nothing is rewritten
   * to keep a dependency satisfied either — a feature dragged ahead of something it waits on is a
   * contradiction the forward pass reports as an ignored edge, and repairing it here is exactly the
   * silent solver spec §6 refuses.
   */
  async place(at: PlanRef, featureId: string, to: FeaturePlacement): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      const found = pickFeature(current, featureId)
      assertEpic(current, to.epicId)
      const moved: PlanFeature = { ...found, epicId: to.epicId }
      const swapped = current.features.map((each) => (each.id === featureId ? moved : each))
      const rail = swapped.filter((each) => each.epicId === to.epicId)
      const placed = new Map(placeAmong(rail, featureId, to.position).map((each) => [each.id, each]))
      const features = densifiedFeatures(swapped.map((each) => placed.get(each.id) ?? each))
      return this.#save(at.product, { ...current, features })
    })
  }

  /**
   * Replaces what one feature waits on, refusing a cycle, a stranger and a budget overrun.
   *
   * Every check runs before the first store call, so a refusal writes nothing at all. A cycle is
   * found by running `findCycles` over the features this call is *about* to save: the graph it
   * decides on is the one that would be stored, not the one on disk. Any cycle in that graph refuses
   * the write, which is stricter than "the cycle you just made" — a plan whose volume was hand-edited
   * into a cycle refuses edge writes until the cycle is gone, and `schedule()` keeps reporting it
   * meanwhile rather than a page breaking (spec §6).
   *
   * An id is refused unless it names a feature in **this** plan, a self-edge included, so no edge
   * can leave the plan directory (ADR 0050). A repeated id is stored once, which is also what it
   * costs: the budget counts distinct edges because that is what gets written.
   *
   * `edgesPerPlan` bounds the **whole manifest**, not one feature, so the count `assertWithin` is
   * handed is the total this write would leave, minus one. Two reasons for the minus: `assertWithin`
   * answers "may one more be added", and this call adds several at once by replacing a list — so the
   * question is whether the total it *leaves* is within the bound. Subtracting the feature's own
   * current edges first is what lets a plan sitting exactly at the cap still have its edges edited,
   * instead of freezing every edge list on the plan at once.
   */
  async setDependencies(
    at: PlanRef,
    featureId: string,
    dependsOn: readonly string[],
  ): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      const found = pickFeature(current, featureId)
      const edges = [...new Set(dependsOn)]
      assertEdgesExist(current, featureId, edges)
      const total = edgeTotal(current.features) - found.dependsOn.length + edges.length
      assertWithin('edgesPerPlan', total - 1)
      const next: PlanFeature = { ...found, dependsOn: edges, updatedAt: this.#ctx.clock.now() }
      const features = current.features.map((each) => (each.id === featureId ? next : each))
      assertAcyclic(features)
      return this.#save(at.product, { ...current, features })
    })
  }

  /**
   * Removes a feature, the items under it and every edge that named it, in one write.
   *
   * The items go in the single `deleteItems` call the port takes a list for (ADR 0006), and the
   * strip runs across every rail: an edge left pointing at a feature that no longer exists is one
   * `findCycles` drops silently, after which the forward pass places a bar as though the dependency
   * had never been stated.
   */
  async remove(at: PlanRef, featureId: string): Promise<PlanManifest> {
    return this.#ctx.lock.run(async () => {
      const current = await this.#read(at)
      pickFeature(current, featureId)
      const { manifest, itemIds } = withoutFeatures(current, [featureId])
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
