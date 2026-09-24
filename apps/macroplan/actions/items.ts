'use server'

import type { ItemChange, ItemPlacement, NewItem, Plan } from '@repo/api-client'
import { adminWrite } from './plan-write'
import type { ActionResult } from './result'

type Estimate = Exclude<ItemChange['estimateDays'], undefined>

/**
 * Adds an item at the end of the feature the draft names, and answers the recomputed plan.
 *
 * Takes the whole {@link NewItem} because its `estimateDays` is optional on the wire, as
 * `createFeature` does. The feature's span grows by this item's estimate, so the plan that comes back
 * has already moved everything after it.
 */
export async function createItem(planId: string, item: NewItem): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.items.create(planId, item))
}

/**
 * Renames one item.
 *
 * One field per request, as the feature actions send, and here the reason is a seam rather than a
 * refusal to avoid: `PATCH .../items/{itemId}` authorises the fields the body carries — a `name`
 * against `item:rename`, an `estimateDays` against `item:estimate` — and
 * `packages/kernel/src/access/policy.ts` grants **both** to `write` today, so no seat exists that this
 * split rescues. It is the same shape for the day one of them moves, and it costs one request.
 */
export async function renameItem(
  planId: string,
  itemId: string,
  name: string,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.items.update(planId, itemId, { name }))
}

/**
 * Re-estimates one item, or clears its estimate with `null`.
 *
 * `null` clears, zero is a real estimate, and leaving the estimate alone is not calling this at all —
 * the three states `UpdateItemPayload` distinguishes, of which this action can send two.
 */
export async function estimateItem(
  planId: string,
  itemId: string,
  estimateDays: Estimate,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.items.update(planId, itemId, { estimateDays }))
}

/**
 * Replaces one item's description in full, and answers the plan.
 *
 * Its own route rather than a third field on the update above (`PUT .../description`), so it was never
 * a candidate for merging — and its own **authority**, `item:describe`.
 *
 * **Text over the cap is shortened and answered 200, not refused**: `cleanDescription` in
 * `packages/macroplan-domain/src/limits.ts` truncates to `MAX_ITEM_DESCRIPTION_BYTES` in UTF-8 bytes,
 * which `description.length` cannot count — it counts UTF-16 units, and no character is ever fewer
 * bytes than units. So a caller told this succeeded has not been told the text it sent is the text
 * stored; the only way to learn that is to read the item back. A later task counts the bytes in the
 * field, so a user is told before the write rather than never.
 */
export async function describeItem(
  planId: string,
  itemId: string,
  description: string,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.items.describe(planId, itemId, description))
}

/**
 * Moves one item inside its feature or under another, and answers the whole recomputed plan.
 *
 * Needs a `manage` seat where creating, renaming, re-estimating and describing an item need only
 * `write`: `item:place` is where the line falls, as it does for a feature. The item's estimate crosses
 * with it, so both features' spans change — which is why the answer is the plan, and why what
 * `placeFeature` in `features.ts` records about undo holds for a dropped item too.
 */
export async function placeItem(
  planId: string,
  itemId: string,
  to: ItemPlacement,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.items.place(planId, itemId, to))
}

/**
 * Removes one item and the file holding its description.
 *
 * Needs `manage`, like {@link placeItem}: a `write` seat can fill a feature in and remove nothing from
 * it. Its feature's span shrinks by exactly this item's estimate, so the plan that comes back has
 * already moved every bar after it.
 */
export async function removeItem(planId: string, itemId: string): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.items.remove(planId, itemId))
}
