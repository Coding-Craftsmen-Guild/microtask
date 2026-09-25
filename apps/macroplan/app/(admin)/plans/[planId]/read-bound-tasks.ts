import type { BoundTasks } from '@repo/api-client'
import { cache } from 'react'
import { apiForSession } from '../../../../lib/api'
import type { PlanScreenModel } from '../../../../components/plan/plan-screen-model'

/**
 * The rail one item sits under, or `null` when the chain cannot be walked.
 *
 * Two hops, because the three arrays are siblings rather than nested. `null` for a broken chain rather
 * than a guess: an item whose feature the plan does not hold has no rail, and the drawer route answers
 * 404 for it anyway — this is the narrower question of whether there is a rail to ask the bridge about.
 */
export function railOfItem(plan: PlanScreenModel, itemId: string): string | null {
  const item = plan.items.find((each) => each.id === itemId)
  const feature = plan.features.find((each) => each.id === item?.featureId)
  return plan.epics.find((each) => each.id === feature?.epicId)?.id ?? null
}

/**
 * The tasks of one rail's bound project, or `null` — the list a picker chooses from.
 *
 * Every failure collapses to `null`, exactly as `read-bridge.ts` does and for the same reason: this read
 * exists to fill a picker, and a picker that cannot be filled must cost the picker and not the drawer.
 * The route behind it answers **409** for a rail bound to nothing, which is the ordinary case on most
 * plans — so a `null` here is far more often "nothing is bound" than "something went wrong", and neither
 * is a failure the person opening a drawer should be shown.
 *
 * It is gated on `epic:bind` and so admin-only, which is a decision recorded in the route's own TSDoc and
 * in ADR 0052: design §7.3 grants an effective `write` holder the **linked** task's name, and a list of
 * every task in the bound project is materially more than that. A seat surface therefore never calls this
 * and its drawer draws no picker — the stated consequence being that a `write` seat may link, because
 * §7.1 grants `item:link` to `write`, and has nothing to link *from*. Closing that means deciding what a
 * seat may enumerate, which is a decision rather than a detail.
 *
 * `cache()` because the drawer renders once per navigation and a second component under it may want the
 * same list.
 */
export const readBoundTasks = cache(async (planId: string, epicId: string): Promise<BoundTasks | null> => {
  const api = await apiForSession()
  if (api === null) return null
  try {
    return await api.epics.tasks(planId, epicId)
  } catch {
    return null
  }
})
