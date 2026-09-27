import { ShareManager } from '../../../components/plan/share/share-manager'
import type { PlanScreenModel } from '../../../components/plan/plan-screen-model'
import type { SeatManagerActions, SeatPlanOwnActions } from '../../../components/plan/seat-own-actions'
import { SettingsPanel } from '../../../components/plan/settings/settings-panel'
import type { PlanControls } from '../../../lib/plan-capabilities'

/**
 * The two slots a seat surface fills that are about the **plan** rather than what is on its rails.
 *
 * Split from `./seat-slots.tsx` when that file met ADR 0027’s eighty-line cap for a `.tsx`, and split
 * **here** rather than one panel per file because the two halves answer different questions. The rails and
 * the groups are collections *in* the plan, each slot opened by a `create` action on that collection; these
 * two are about the plan itself and its seats, and neither has a collection to be opened by.
 *
 * Both are `manage`-only, and neither is refused for want of a mechanism any longer: the seat twins of both
 * sets of actions exist (`actions/seat-plan.ts`, `actions/seat-seats.ts`), each taking the token first so
 * `components/plan/seat-own-actions.ts` can bind it in — and the page's leak sweep calls every bound action
 * it is handed to prove the token it carries is the visitor's own (`page.test.tsx`).
 */
/**
 * The settings panel as a seat builds it, or `null` where this seat may do none of the three.
 *
 * The twin of `settingsSlot`, and the one whose absence cost a `manage` seat most: all three plan-level
 * actions are `manage`, so a seat given a plan may rename it, retime it and delete it — and until these
 * twins existed it could do none of them, so a plan handed over with the wrong start date was wrong for
 * whoever received it.
 *
 * **Deleting from here ends the caller’s own access**, because deleting a plan revokes every seat on it
 * inside the same locked write. `seatDeletePlan` therefore redirects to `/s/unavailable` rather than to an
 * index a seat is refused, and the confirm says the links stop working — which is true of the person
 * clicking it.
 */
export function seatSettingsSlot(
  plan: PlanScreenModel,
  writes: SeatPlanOwnActions,
  controls: PlanControls,
) {
  const { plan: own } = controls
  if (!own.rename && !own.retime && !own.remove) return null
  return (
    <SettingsPanel
      mayRemove={own.remove}
      mayRename={own.rename}
      mayRetime={own.retime}
      plan={plan}
      remove={writes.remove}
      rename={writes.rename}
      retime={writes.retime}
    />
  )
}

/**
 * The share manager as a seat builds it, or `null` where this seat is told no seats at all.
 *
 * The twin of what `[planId]/layout.tsx` mounts, and the last of the five `null`s on this surface to lift.
 * `capabilities()` answers a plan-scoped `manage` seat true on all four `share:*` questions (ADR 0038, ADR
 * 0053), so administering this plan’s other seats is the API’s own answer rather than a widening taken here.
 *
 * Drawn on `seats.read`, because a manager that cannot list is a dialog that opens onto nothing; the other
 * three cross as flat booleans, which is the shape `module-boundaries.test.tsx` admits.
 *
 * **The seats it lists carry live tokens**, and that is the one thing to hold steady about this slot: they
 * arrive from `seatReadSeats` **after** the manager is open, never in this page’s payload. `planScreenModel`
 * drops the block on the server and its `shareLinks?: never` makes carrying one a compile error, so no
 * token is in the HTML — which is exactly the property ADR 0033 asks for, and mounting a manager does not
 * weaken it.
 */
export function seatShareSlot(
  plan: PlanScreenModel,
  seats: SeatManagerActions,
  controls: PlanControls,
) {
  if (!controls.seats.read) return null
  return (
    <ShareManager
      editSeat={seats.update}
      listSeats={seats.list}
      mayCreate={controls.seats.create}
      mayRead={controls.seats.read}
      mayRevoke={controls.seats.revoke}
      mayUpdate={controls.seats.update}
      mintSeat={seats.create}
      planId={plan.id}
      revokeSeat={seats.revoke}
    />
  )
}
