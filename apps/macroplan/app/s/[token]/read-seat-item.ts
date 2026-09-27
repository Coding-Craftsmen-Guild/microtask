import type { PlanBridge } from '@repo/api-client'
import { cache } from 'react'
import { linkCall } from '../../../actions/link-call'
import type { ActionResult } from '../../../actions/result'
import { apiForLink } from '../../../lib/api'

/** What a bridge read answers this seat, or `null` for a read that did not land. */
export type SeatBridgeRead = PlanBridge | null

/**
 * The text one item's own file holds, or the refusal that stands in place of a description box.
 *
 * The seat twin of `(admin)/plans/[planId]/i/[itemId]/read-description.ts`, and every argument there holds:
 * a plan carries no descriptions — `PlanManifest` is "everything about a plan except its item descriptions" —
 * so the field cannot be seeded from the plan the layout already read, and drawing an empty box over text
 * nobody has seen would let the first blur replace a description with nothing, `describeItem` being a
 * **replace** rather than a patch.
 *
 * `linkCall` and not `linkRead`, so a 404 or a 422 comes back as itself rather than reaching
 * `LINK_UNAVAILABLE_PATH`. The plan read has already decided this page renders and the row has already been
 * found, so a refusal here is not a dead link: it is one item file the API would not answer for, and the
 * honest answer is the panel without its description box.
 *
 * Not `cache()`d, for the reason the admin twin is not: it has exactly one caller, which calls it once, and a
 * cache would only be a second reason to believe there were more.
 */
export async function readSeatDescription(
  token: string,
  planId: string,
  itemId: string,
): Promise<ActionResult<string>> {
  const read = await linkCall(token, (api) => api.plans.readItem(planId, itemId))
  return read.ok ? { ok: true, value: read.value.description } : read
}

/**
 * What this plan's linked tasks count, as the bridge answers **this seat**, or `null`.
 *
 * ### Every failure is one answer, and that is the whole point
 *
 * The same collapse `read-bridge.ts` makes on the admin surface, and for the same reason (ADR 0061): the
 * bridge is a **second** read, and Microtask being unavailable must not take the plan down with it. So a
 * refusal, a timeout, a 404 and a thrown error are all `null`, and `null` renders as no counted number — which
 * is exactly what design §7.2 requires, "an unlinked item has a manual status only — not a manual percentage
 * — so a number on screen is always a counted number".
 *
 * ### What a seat is told, which the API decides and this does not
 *
 * The response is shaped per caller before it leaves the server: the `epics` block is absent for anybody but
 * an admin, and `taskName` is absent on any row whose rail this seat reaches at less than an effective
 * `write`. So there is nothing here to hide and no branch on role — a `view` seat's answer is already the
 * answer it is owed. `apps/api/src/bridge/bridge-view.ts` is where that shaping lives.
 *
 * `cache()`d on the token and the plan id, so the layout's progress numbers and a drawer segment's are one
 * request rather than two on a cold load.
 */
export const readSeatBridge = cache(
  async (token: string, planId: string): Promise<SeatBridgeRead> => {
    const api = apiForLink(token)
    if (api === null) return null
    try {
      return await api.plans.readBridge(planId)
    } catch {
      return null
    }
  },
)
