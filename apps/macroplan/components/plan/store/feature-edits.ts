import type { FeatureChange, FeaturePlacement, NewFeature } from '@repo/api-client'
import type { PlanScreenModel } from '../plan-screen-model'
import { cleanName } from './clean-name'
import { densifiedBy, placeAmong } from './edit-order'

type Feature = PlanScreenModel['features'][number]

const onRail = (feature: Feature): string => feature.epicId

const swap = (plan: PlanScreenModel, id: string, next: (feature: Feature) => Feature): PlanScreenModel =>
  plan.features.some((one) => one.id === id)
    ? { ...plan, features: plan.features.map((one) => (one.id === id ? next(one) : one)) }
    : plan

/**
 * A feature renamed, re-estimated or pinned — the fields the change names, and no others.
 *
 * `FeatureService.update` in the domain, mirrored for an optimistic edit (ADR 0069). A name the API would
 * refuse as empty leaves the old one standing, so the bar does not blank while the refusal is on its way.
 * A feature the plan does not hold hands the plan back untouched: there is nothing to show, and the API's
 * 404 is what the caller will say.
 *
 * @param plan - The plan as it stands.
 * @param id - The feature.
 * @param change - The fields to set; `null` clears an estimate or a pin.
 * @returns The plan with the feature changed.
 */
export function changeFeature(plan: PlanScreenModel, id: string, change: FeatureChange): PlanScreenModel {
  return swap(plan, id, (one) => ({
    ...one,
    name: change.name === undefined ? one.name : (cleanName(change.name) ?? one.name),
    estimateDays: change.estimateDays === undefined ? one.estimateDays : change.estimateDays,
    pinSprint: change.pinSprint === undefined ? one.pinSprint : change.pinSprint,
  }))
}

/**
 * A feature moved to a place on its own rail or on another, both rails renumbered.
 *
 * `FeatureService.place`: the feature takes the destination rail, `placeAmong` puts it at the place on
 * that rail, and every rail is densified — which is what closes the gap it left on the one it came from.
 *
 * @param plan - The plan as it stands.
 * @param id - The feature being moved.
 * @param to - The rail and the place on it.
 * @returns The plan with the feature placed, or the plan itself for a rail or feature it does not hold.
 */
export function placeFeature(plan: PlanScreenModel, id: string, to: FeaturePlacement): PlanScreenModel {
  const known = plan.epics.some((one) => one.id === to.epicId) && plan.features.some((one) => one.id === id)
  if (!known) return plan
  const swapped = plan.features.map((one) => (one.id === id ? { ...one, epicId: to.epicId } : one))
  const rail = swapped.filter((one) => one.epicId === to.epicId)
  const placed = new Map(placeAmong(rail, id, to.position).map((one) => [one.id, one]))
  return { ...plan, features: densifiedBy(swapped.map((one) => placed.get(one.id) ?? one), onRail) }
}

/**
 * A feature's dependencies replaced, each named once — `FeatureService.setDependencies`, which dedupes
 * with a `Set` before it checks anything.
 *
 * @param plan - The plan as it stands.
 * @param id - The feature that waits.
 * @param dependsOn - Everything it now waits on.
 * @returns The plan with the edges replaced.
 */
export const dependFeature = (plan: PlanScreenModel, id: string, dependsOn: readonly string[]): PlanScreenModel =>
  swap(plan, id, (one) => ({ ...one, dependsOn: [...new Set(dependsOn)] }))

/**
 * A feature put in a group, or taken out of every group with `null` — `FeatureService.setLabel`.
 *
 * @param plan - The plan as it stands.
 * @param id - The feature.
 * @param labelId - The group, or `null`.
 * @returns The plan with the feature grouped.
 */
export const labelFeature = (plan: PlanScreenModel, id: string, labelId: string | null): PlanScreenModel =>
  swap(plan, id, (one) => ({ ...one, labelId }))

/**
 * The plan without some features: their items gone, every edge to them dropped, every rail renumbered.
 *
 * `withoutFeatures` in the domain's `services/cascade.ts`, and shared here by a feature's removal and a
 * rail's, exactly as it is there.
 *
 * @param plan - The plan as it stands.
 * @param gone - The features to remove.
 * @returns The plan without them.
 */
export function withoutFeatures(plan: PlanScreenModel, gone: ReadonlySet<string>): PlanScreenModel {
  const kept = plan.features
    .filter((one) => !gone.has(one.id))
    .map((one) =>
      one.dependsOn.some((id) => gone.has(id)) ? { ...one, dependsOn: one.dependsOn.filter((id) => !gone.has(id)) } : one,
    )
  const items = plan.items.filter((one) => !gone.has(one.featureId))
  return { ...plan, features: densifiedBy(kept, onRail), items }
}

/**
 * One feature removed, with everything `withoutFeatures` takes with it — `FeatureService.remove`.
 *
 * @param plan - The plan as it stands.
 * @param id - The feature.
 * @returns The plan without it.
 */
export const removeFeature = (plan: PlanScreenModel, id: string): PlanScreenModel =>
  withoutFeatures(plan, new Set([id]))

/**
 * A feature created at the end of its rail, under an id the caller chose — `FeatureService.add`.
 *
 * The id is a placeholder (`pending:<n>`) until the create is answered, and the real ULID once it has
 * been (`./plan-store.ts`). It is appended to the array because that is where the API puts a created
 * feature, and the draw gesture reads the last one as the new one. A rail the plan does not hold creates
 * nothing.
 *
 * An id the plan already holds adds nothing either. A plan the server pushes in the middle of a draw can
 * already hold the feature the draw's create stored, and the draw is re-applied on top of it under that
 * feature's real id: adding it again would draw it twice until the draw's last write was answered.
 *
 * @param plan - The plan as it stands.
 * @param draft - What the create sends.
 * @param id - The placeholder id, or the real one once the create has been answered.
 * @returns The plan with the feature added.
 */
export function addFeature(plan: PlanScreenModel, draft: NewFeature, id: string): PlanScreenModel {
  if (!plan.epics.some((one) => one.id === draft.epicId) || plan.features.some((one) => one.id === id)) return plan
  const created: Feature = {
    id,
    epicId: draft.epicId,
    name: cleanName(draft.name) ?? draft.name,
    position: plan.features.filter((one) => one.epicId === draft.epicId).length,
    estimateDays: draft.estimateDays ?? null,
    pinSprint: draft.pinSprint ?? null,
    labelId: null,
    dependsOn: [],
    createdAt: plan.updatedAt,
    updatedAt: plan.updatedAt,
  }
  return { ...plan, features: [...plan.features, created] }
}
