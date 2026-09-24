'use server'

import type {
  FeatureChange,
  FeaturePlacement,
  FeaturesApi,
  NewFeature,
  Plan,
} from '@repo/api-client'
import { adminWrite } from './plan-write'
import type { ActionResult } from './result'

type Estimate = Exclude<FeatureChange['estimateDays'], undefined>

type Pin = Exclude<FeatureChange['pinSprint'], undefined>

type Dependencies = Parameters<FeaturesApi['setDependencies']>[2]

/**
 * Adds a feature at the end of the rail the draft names, and answers the recomputed plan.
 *
 * Takes the whole {@link NewFeature} for the reason `createEpic` gives of its own colour: two of its
 * four fields are optional on the wire.
 *
 * One gate stands in front of all four of them — `apps/api/src/routes/macroplan/features/handlers.ts`
 * asks `feature:create` and nothing else — while `CreateFeaturePayload` accepts a `pinSprint`. So a
 * `write` seat may create a feature already pinned to a sprint it would be refused
 * {@link pinFeature} on afterwards. Nothing here narrows that: the API is the gate, and an app that
 * stripped the field would be a second copy of a policy only the API may hold.
 */
export async function createFeature(
  planId: string,
  feature: NewFeature,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.features.create(planId, feature))
}

/**
 * Renames one feature.
 *
 * One of three actions over `PATCH .../features/{featureId}`, each carrying exactly one field,
 * because that route authorises the fields a body **carries** and not the route: a `name` is asked
 * against `feature:rename`, an `estimateDays` against `feature:estimate` — both granted to `write` —
 * and a `pinSprint` against `feature:pin`, which only `manage` holds
 * (`packages/kernel/src/access/policy.ts`). A body carrying two of them meets both of their gates
 * before the store is opened, and the first refusal throws, so one action taking all three fields
 * would hand a `write` seat a 403 for the pin and lose the rename it was allowed. Three actions is
 * three requests, and the permitted ones land.
 */
export async function renameFeature(
  planId: string,
  featureId: string,
  name: string,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.features.update(planId, featureId, { name }))
}

/**
 * Re-estimates one feature, or clears its estimate with `null`.
 *
 * `null` and omission are different things on the wire, and this action can only send the first:
 * omitting the key leaves the estimate alone, which is what *not calling this* means. Zero is a real
 * estimate and not a clear. Split from {@link pinFeature} for the reason {@link renameFeature}
 * records: `feature:estimate` is what a `write` seat holds and `feature:pin` is not.
 */
export async function estimateFeature(
  planId: string,
  featureId: string,
  estimateDays: Estimate,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.features.update(planId, featureId, { estimateDays }))
}

/**
 * Pins one feature to a sprint it may not start before, or unpins it with `null`.
 *
 * The action on this route that a `write` seat is refused: `feature:pin` is granted only to `manage`,
 * because an estimate says what the work costs and a pin says where the bar sits. It travels alone so
 * that refusal costs nothing else — {@link renameFeature} holds the whole argument.
 */
export async function pinFeature(
  planId: string,
  featureId: string,
  pinSprint: Pin,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.features.update(planId, featureId, { pinSprint }))
}

/**
 * Moves one feature along its rail or onto another, and answers the whole recomputed plan.
 *
 * The plan rather than nothing, and that is what makes the drop undoable: the placement being undone
 * is read out of the plan the surface was holding **before** the drop, so there is no shadow copy of
 * the geometry to keep in step with the server. A feature dragged ahead of something it waits on is
 * not refused — the contradiction comes back in the plan's `schedule.ignoredEdges` for the surface to
 * draw.
 */
export async function placeFeature(
  planId: string,
  featureId: string,
  to: FeaturePlacement,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.features.place(planId, featureId, to))
}

/**
 * Replaces the whole set of features this one waits on; not an add, and not a remove.
 *
 * There is no narrower route to reach for: the API takes a complete `dependsOn` list, so adding one
 * edge means reading a feature's current list out of a plan, appending to it, and sending the whole
 * thing back. Two callers doing that from the same starting plan each overwrite the other's edge
 * silently — the route takes no `If-Match` to catch it — so a caller that cares re-reads the plan
 * this action answers with rather than trusting the list it sent.
 *
 * A cycle is refused whole, as a 409 naming the features that would wait on each other, and nothing
 * is written. `feature:depend` is the one gate on this route, and only `manage` holds it — `write`
 * does not.
 */
export async function setDependencies(
  planId: string,
  featureId: string,
  dependsOn: Dependencies,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.features.setDependencies(planId, featureId, dependsOn))
}

/**
 * Removes one feature, its items and every edge that named it.
 *
 * Answers the plan that remains: an edge pointing at a feature that no longer exists is one the
 * forward pass drops, and a bar that waited on this one is then placed as though it never had.
 */
export async function removeFeature(
  planId: string,
  featureId: string,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.features.remove(planId, featureId))
}
