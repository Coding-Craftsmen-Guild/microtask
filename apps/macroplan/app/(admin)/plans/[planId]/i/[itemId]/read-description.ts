import { adminCall, type ActionResult } from '../../../../../../actions/result'
import { planPath } from '../../../../../../lib/routes'

/**
 * The text one item's own file holds, or the refusal that stands in place of a description box.
 *
 * ### Why this is a second read, and why it is not the plan's
 *
 * A plan carries no descriptions. `PlanManifest` is "everything about a plan except its item
 * descriptions" (`packages/contracts/src/plan.ts`) — each one lives in that item's own file, and
 * `plans.readItem` is the only way to it. So the description field cannot be seeded from the plan the
 * layout and this page already share, and the alternative was to draw an empty box over text nobody
 * had seen: the first blur would then replace a description with nothing, `describeItem` being a
 * **replace** rather than a patch. One small extra `GET` is the price of the field, and only the item
 * segment pays it.
 *
 * It is not `cache()`d, where `readPlan` beside it is. That cache exists because four callers under
 * `[planId]` want the same plan on one render and a layout cannot hand its children a prop; this has
 * exactly one caller, which calls it once, so a cache would only be a second reason to believe there
 * were more.
 *
 * ### Why a refusal is a value here rather than a page
 *
 * {@link adminCall} and not `adminRead`, so a 404 or a 422 comes back as itself instead of reaching
 * `notFound()`. The plan read has already decided this page renders and the row has already been
 * found, so a refusal at this point is not a missing item: it is an item file the API would not answer
 * for, and the honest answer is the panel without its description box rather than a not-found page over
 * a feature, a rail and a sprint that were all read successfully. `i/[itemId]/page.tsx` turns the
 * refusal into that `null`, and the read is made only once the row is found so that a stale link costs
 * one request rather than two.
 *
 * The `?next=` path it would redirect an expired admin to is the **plan's**, exactly as `readPlan`'s
 * is, so the two cannot key two entries between them or land the admin on a drawer.
 *
 * @param planId - The plan the item belongs to, as the URL spelled it.
 * @param itemId - The item whose file to read.
 * @returns The stored description, which is `''` for an item nobody has described.
 */
export async function readDescription(
  planId: string,
  itemId: string,
): Promise<ActionResult<string>> {
  const read = await adminCall(planPath(planId), (api) => api.plans.readItem(planId, itemId))
  return read.ok ? { ok: true, value: read.value.description } : read
}
