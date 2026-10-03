import type { PlanBridge } from '@repo/api-client'
import { cache } from 'react'
import { apiForLink } from '../../../lib/api'

/** What a bridge read answers this seat, or `null` for a read that did not land. */
export type SeatBridgeRead = PlanBridge | null


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
