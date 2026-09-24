'use server'

import type {
  FeatureChange,
  FeaturePlacement,
  FeaturesApi,
  ItemChange,
  ItemPlacement,
  NewEpic,
  NewFeature,
  NewItem,
  Plan,
} from '@repo/api-client'
import { seatWrite } from './plan-write'
import type { ActionResult } from './result'

type Answer = Promise<ActionResult<Plan>>

type Estimate = Exclude<FeatureChange['estimateDays'], undefined>

type Pin = Exclude<FeatureChange['pinSprint'], undefined>

type Dependencies = Parameters<FeaturesApi['setDependencies']>[2]

type ItemEstimate = Exclude<ItemChange['estimateDays'], undefined>

/**
 * Adds a rail at the bottom of the plan, under the authority of the share token handed in.
 *
 * **The token is the first argument of every action in this file, and it is the whole credential.**
 * A Server Action is a public endpoint, so that argument is whatever the browser sent — which is
 * safe on this surface and on no other, because the token *is* the proof rather than a claim about
 * one: an action called with a token has exactly that token's power, decided by the API from the
 * seat's own role and the plan it is rooted in on every call, and that is no more than holding the
 * URL already gives (ADR 0040). No cookie is read, so an admin signed in on the same browser lends
 * a seat nothing. `apps/microtask/actions/link-share-links.ts` takes the same argument first for the
 * same reason.
 *
 * **All eighteen writes are here, and this file narrows none of them to a role.** A `view` seat may
 * write nothing, a `write` seat holds seven of them, and a `manage` seat holds every one — but that
 * table lives in `packages/kernel/src/access/policy.ts`, and a copy of it in an app would be a
 * second policy free to drift from the one that is actually enforced. So every action is exposed,
 * the API refuses what the seat may not do, and the refusal comes back as this surface's own
 * sentence (`lib/refusal.ts`). Which *control* a page draws is a separate question, answered from
 * `planCapabilities` and never from what this file exports.
 *
 * Each action is the mirror of the like-named one in `epics.ts`, `features.ts` or `items.ts` — same
 * route, same method, same one field per body — so the reasoning about *what* is sent lives there
 * and is not restated eighteen times here. What each doc below adds is the grant the API asks for
 * it, because that is the one thing a seat can be refused for and an admin cannot.
 *
 * `epic:create`, and only `manage` holds it: every `epic:*` action is a `manage` grant, because a
 * rail is the shape of the plan rather than the work on it (spec §7.1).
 */
export async function seatCreateEpic(token: string, planId: string, epic: NewEpic): Answer {
  return seatWrite(token, (api) => api.epics.create(planId, epic))
}

/** Renames one rail. `epic:rename`, which only `manage` holds. */
export async function seatRenameEpic(
  token: string,
  planId: string,
  epicId: string,
  name: string,
): Answer {
  return seatWrite(token, (api) => api.epics.update(planId, epicId, { name }))
}

/** Recolours one rail. Gated on `epic:rename` too, as `recolourEpic` records. */
export async function seatRecolourEpic(
  token: string,
  planId: string,
  epicId: string,
  colour: string,
): Answer {
  return seatWrite(token, (api) => api.epics.update(planId, epicId, { colour }))
}

/** Moves one rail among its siblings. `epic:reorder`, a `manage` grant of its own. */
export async function seatReorderEpic(
  token: string,
  planId: string,
  epicId: string,
  railOrder: number,
): Answer {
  return seatWrite(token, (api) => api.epics.place(planId, epicId, { railOrder }))
}

/** Removes one rail, its features and their items. `epic:delete`, which only `manage` holds. */
export async function seatRemoveEpic(token: string, planId: string, epicId: string): Answer {
  return seatWrite(token, (api) => api.epics.remove(planId, epicId))
}

/**
 * Adds a feature at the end of the rail its draft names. `feature:create`, which a `write` seat
 * holds.
 *
 * One gate stands in front of the whole body while `CreateFeaturePayload` accepts a `pinSprint`, so
 * a `write` seat may create a feature already pinned to a sprint {@link seatPinFeature} would refuse
 * it afterwards — `createFeature` in `features.ts` holds that argument in full. Nothing here strips
 * the field, for the same reason nothing here narrows the eighteen.
 */
export async function seatCreateFeature(
  token: string,
  planId: string,
  feature: NewFeature,
): Answer {
  return seatWrite(token, (api) => api.features.create(planId, feature))
}

/** Renames one feature. `feature:rename`, which a `write` seat holds. */
export async function seatRenameFeature(
  token: string,
  planId: string,
  featureId: string,
  name: string,
): Answer {
  return seatWrite(token, (api) => api.features.update(planId, featureId, { name }))
}

/**
 * Re-estimates one feature, or clears its estimate with `null`. `feature:estimate`, a `write` grant.
 *
 * It travels apart from {@link seatPinFeature} on this surface for a reason the admin surface does
 * not have: that route authorises the fields a body **carries**, and these two fields are the exact
 * pair a `write` seat is granted one of and refused the other, so one merged action would lose the
 * estimate it was allowed to the pin it was not.
 */
export async function seatEstimateFeature(
  token: string,
  planId: string,
  featureId: string,
  estimateDays: Estimate,
): Answer {
  return seatWrite(token, (api) => api.features.update(planId, featureId, { estimateDays }))
}

/** Pins one feature to a sprint, or unpins it with `null`. `feature:pin`, a `manage` grant. */
export async function seatPinFeature(
  token: string,
  planId: string,
  featureId: string,
  pinSprint: Pin,
): Answer {
  return seatWrite(token, (api) => api.features.update(planId, featureId, { pinSprint }))
}

/** Moves one feature along its rail or onto another. `feature:place`, a `manage` grant. */
export async function seatPlaceFeature(
  token: string,
  planId: string,
  featureId: string,
  to: FeaturePlacement,
): Answer {
  return seatWrite(token, (api) => api.features.place(planId, featureId, to))
}

/**
 * Replaces the whole set of features one feature waits on. `feature:depend`, a `manage` grant.
 *
 * A cycle is refused 409 and nothing is written, and on this surface that refusal reads "Someone
 * else changed this at the same time" — `setDependencies` in `features.ts` says why a caller that
 * wants to name the cycle has to work it out before it sends.
 */
export async function seatSetDependencies(
  token: string,
  planId: string,
  featureId: string,
  dependsOn: Dependencies,
): Answer {
  return seatWrite(token, (api) => api.features.setDependencies(planId, featureId, dependsOn))
}

/** Removes one feature, its items and every edge that named it. `feature:delete`, a `manage` grant. */
export async function seatRemoveFeature(token: string, planId: string, featureId: string): Answer {
  return seatWrite(token, (api) => api.features.remove(planId, featureId))
}

/** Adds an item at the end of the feature its draft names. `item:create`, a `write` grant. */
export async function seatCreateItem(token: string, planId: string, item: NewItem): Answer {
  return seatWrite(token, (api) => api.items.create(planId, item))
}

/** Renames one item. `item:rename`, a `write` grant. */
export async function seatRenameItem(
  token: string,
  planId: string,
  itemId: string,
  name: string,
): Answer {
  return seatWrite(token, (api) => api.items.update(planId, itemId, { name }))
}

/** Re-estimates one item, or clears its estimate with `null`. `item:estimate`, a `write` grant. */
export async function seatEstimateItem(
  token: string,
  planId: string,
  itemId: string,
  estimateDays: ItemEstimate,
): Answer {
  return seatWrite(token, (api) => api.items.update(planId, itemId, { estimateDays }))
}

/**
 * Replaces one item's description in full. `item:describe`, which a `write` seat holds.
 *
 * Spec §7.1's table names creating, renaming and estimating as what `write` may do and does not
 * mention describing; `GRANTS` is what the API asks, and it puts `item:describe` in `WRITE`. The
 * grant is the gate, so a `write` seat may describe an item.
 *
 * Text over the byte cap is shortened and answered 200, never refused (`describeItem`), so a seat
 * told this succeeded has not been told the text it sent is the text stored.
 */
export async function seatDescribeItem(
  token: string,
  planId: string,
  itemId: string,
  description: string,
): Answer {
  return seatWrite(token, (api) => api.items.describe(planId, itemId, description))
}

/** Moves one item inside its feature or under another. `item:place`, a `manage` grant. */
export async function seatPlaceItem(
  token: string,
  planId: string,
  itemId: string,
  to: ItemPlacement,
): Answer {
  return seatWrite(token, (api) => api.items.place(planId, itemId, to))
}

/** Removes one item and the file holding its description. `item:delete`, a `manage` grant. */
export async function seatRemoveItem(token: string, planId: string, itemId: string): Answer {
  return seatWrite(token, (api) => api.items.remove(planId, itemId))
}
