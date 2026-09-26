'use server'

import type { NewBinding, NewLabel } from '@repo/api-client'
import { seatWrite } from './plan-write'
import type { ActionResult } from './result'
import type { Plan } from '@repo/api-client'

type Answer = Promise<ActionResult<Plan>>

/**
 * The bridge's five writes, sent under a seat's own token rather than the admin's.
 *
 * Split out of `seat-writes.ts` because that file reached ADR 0027's 150-line cap, and split **here**
 * rather than anywhere else because these five are the ones that reach the other product: three of them
 * are refused unless a rail is bound, and two are refused outright for any seat at all. A reader looking
 * for what a seat may do to Microtask finds exactly this file, and `seat-writes.ts` keeps the twenty-one
 * writes that never leave this product.
 *
 * Every one is wired onto the seat surface even so, and `seat-actions.test.ts` asserts it: both surfaces
 * carry every member of `PlanEditActions`, so the two stay comparable member for member, and
 * `planCapabilities` is what answers `false` rather than an interface that changes shape per credential.
 *
 * @see seatBindEpic for why two of these are here at all when no seat can ever succeed at them.
 */

/**
 * Binds one rail to a Microtask project. `epic:bind`, which is **admin-only** — so this always 403s.
 *
 * Here anyway, and the reason is the sweep rather than the call: `seat-actions.test.ts` asserts this
 * surface wires every member of `PlanEditActions`, so a member left out would either fail that test or
 * force the interface to be a different shape per credential. What keeps a seat from binding is the
 * API, which is where every other refusal on this surface comes from too — `planCapabilities` draws no
 * control for it, so nothing reachable calls this, and if something did the answer would be the same
 * 403 the route gives any seat.
 */
export async function seatBindEpic(
  token: string,
  planId: string,
  epicId: string,
  binding: NewBinding,
): Answer {
  return seatWrite(token, (api) => api.epics.bind(planId, epicId, binding))
}

/** Unbinds one rail. `epic:bind`, admin-only, so this always 403s — see {@link seatBindEpic}. */
export async function seatUnbindEpic(token: string, planId: string, epicId: string): Answer {
  return seatWrite(token, (api) => api.epics.unbind(planId, epicId))
}

/** Links one item to a task in its rail's bound project. `item:link`, a `write` grant. */
export async function seatLinkItem(
  token: string,
  planId: string,
  itemId: string,
  taskId: string,
): Answer {
  return seatWrite(token, (api) => api.items.link(planId, itemId, { taskId }))
}

/** Unlinks one item from its task. `item:link`, a `write` grant. */
export async function seatUnlinkItem(token: string, planId: string, itemId: string): Answer {
  return seatWrite(token, (api) => api.items.unlink(planId, itemId))
}

/**
 * Creates the linked task in the bound project. `item:link`, plus an effective `manage` on the rail.
 *
 * A `write` seat clears the gate and is then refused by the rail's own ceiling (design §7.3), which is
 * the one refusal on this surface that is about neither the seat's role nor the plan.
 */
export async function seatCreateTask(token: string, planId: string, itemId: string): Answer {
  return seatWrite(token, (api) => api.items.createTask(planId, itemId))
}

/**
 * The five group writes, sent under a seat's own token. Every one of them is `manage`-only.
 *
 * In **this** file rather than `seat-writes.ts` for the reason the bridge writes above are: that file
 * sits at ADR 0027's 150-line cap, and there was nowhere else to put them. They are unlike the bridge
 * five in every other way — none of them reaches Microtask, and a `manage` seat succeeds at all five —
 * so this file is now "the writes that would not fit", which is a worse name than it had. If a sixth
 * group write ever arrives, the split to make is `seat-labels.ts` rather than a third tenant here.
 */

/** Adds a label to the plan. `label:create`, which is `manage`-only. */
export async function seatCreateLabel(token: string, planId: string, label: NewLabel): Answer {
  return seatWrite(token, (api) => api.labels.create(planId, label))
}

/** Renames one label. `label:rename`, `manage`-only. */
export async function seatRenameLabel(
  token: string,
  planId: string,
  labelId: string,
  name: string,
): Answer {
  return seatWrite(token, (api) => api.labels.update(planId, labelId, { name }))
}

/** Recolours one label. The same `label:rename` authority as {@link seatRenameLabel}. */
export async function seatRecolourLabel(
  token: string,
  planId: string,
  labelId: string,
  colour: string,
): Answer {
  return seatWrite(token, (api) => api.labels.update(planId, labelId, { colour }))
}

/** Removes one label, clearing it off every feature in it and deleting none of them. `label:delete`. */
export async function seatRemoveLabel(token: string, planId: string, labelId: string): Answer {
  return seatWrite(token, (api) => api.labels.remove(planId, labelId))
}

/** Puts one feature in a group, or takes it out with `null`. `feature:label`, `manage`-only. */
export async function seatLabelFeature(
  token: string,
  planId: string,
  featureId: string,
  labelId: string | null,
): Answer {
  return seatWrite(token, (api) => api.features.setLabel(planId, featureId, labelId))
}
