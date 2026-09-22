import type { PlanFeature } from '../entities/feature.js'
import type { PlanManifest } from '../entities/plan.js'
import { densifiedFeatures, densifiedRails } from './structure-mapper.js'

const withoutEdgesTo = (feature: PlanFeature, gone: ReadonlySet<string>): PlanFeature => {
  if (!feature.dependsOn.some((id) => gone.has(id))) return feature
  return { ...feature, dependsOn: feature.dependsOn.filter((id) => !gone.has(id)) }
}

/** A plan with a branch taken out of it, and the item files that branch owned. */
export interface Removal {
  /** The manifest to write, with no stamp applied — the caller owns `updatedAt`. */
  readonly manifest: PlanManifest

  /** Every removed item, for the one `deleteItems` call that must carry all of them. */
  readonly itemIds: readonly string[]
}

/**
 * The plan with these features gone: their items gone too, and every edge that named one stripped.
 *
 * Three things have to happen together, which is why they are computed here rather than at each
 * caller. The features go; their items go, because an item under no feature is unreachable from the
 * canvas and would keep a file alive forever; and every *surviving* feature that depended on a
 * removed one loses that edge, because a dangling edge is what `findCycles` drops silently and
 * `schedule` then places a bar as though nothing was ever stated (Task 9). A plan is the unit
 * (ADR 0050), so the strip is plan-wide and runs on every rail, not only the one being cut.
 *
 * What it does **not** do is move anything. Positions are renumbered densely per rail, which closes
 * the gap the removal left and changes nothing else: relative order survives, and a record already
 * carrying the right number comes back as the same object. No estimate, pin or stamp on a surviving
 * record is touched, and `updatedAt` is left to the caller — the plan changed, the features that
 * merely lost an edge to something that no longer exists were not edited by anybody.
 */
export function withoutFeatures(
  manifest: PlanManifest,
  featureIds: readonly string[],
): Removal {
  const gone = new Set(featureIds)
  const kept = manifest.features.filter((each) => !gone.has(each.id))
  const features = densifiedFeatures(kept.map((each) => withoutEdgesTo(each, gone)))
  const items = manifest.items.filter((each) => !gone.has(each.featureId))
  const itemIds = manifest.items.filter((each) => gone.has(each.featureId)).map((each) => each.id)
  return { manifest: { ...manifest, features, items }, itemIds }
}

/**
 * The plan with one rail gone, along with every feature on it and every item under those.
 *
 * Built on {@link withoutFeatures} rather than beside it, so the edge strip and the single item list
 * are the same code an epic delete and a feature delete both run: an epic delete is a feature delete
 * over a whole rail, plus renumbering the rails that are left.
 */
export function withoutEpic(manifest: PlanManifest, epicId: string): Removal {
  const onRail = manifest.features.filter((each) => each.epicId === epicId).map((each) => each.id)
  const removed = withoutFeatures(manifest, onRail)
  const epics = densifiedRails(removed.manifest.epics.filter((each) => each.id !== epicId))
  return { manifest: { ...removed.manifest, epics }, itemIds: removed.itemIds }
}
