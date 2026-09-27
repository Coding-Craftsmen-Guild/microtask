import {
  seatCreateSeat,
  seatReadSeats,
  seatRevokeSeat,
  seatUpdateSeat,
} from '../../actions/seat-seats'
import { seatDeletePlan, seatRenamePlan, seatRetimePlan } from '../../actions/seat-plan'
import type { DeleteWrite } from './settings/delete-plan'
import type { PlanSeatActions } from './share/use-plan-seats'
import type { RenameWrite } from './settings/plan-name-form'
import type { RetimeWrite } from './settings/timing-form'

/**
 * The four seat-management calls a share manager takes, whoever is making them.
 *
 * `PlanSeatActions` itself and not a new shape: the manager's props are typed off that interface, so an
 * alias is what says "the seat wiring satisfies the same contract the admin wiring does" without inventing a
 * second name for one thing. It is re-exported here so both factories in this file read alike.
 */
export type SeatManagerActions = PlanSeatActions

/**
 * The three plan-level writes a settings panel takes, typed off the forms' own write types.
 *
 * Off `RenameWrite`, `RetimeWrite` and `DeleteWrite` rather than spelled out, so a change to any of the
 * three signatures is a compile error here rather than a wiring that has quietly stopped matching the form
 * it feeds. They are **not** `PlanEditActions` members and could not be: two of the three answer something
 * other than a plan (`PlanOwnControls` in `lib/plan-capabilities.ts` holds that argument).
 */
export interface SeatPlanOwnActions {
  readonly rename: RenameWrite
  readonly retime: RetimeWrite
  readonly remove: DeleteWrite
}

/**
 * The four seat-management writes with one share token bound in.
 *
 * A factory rather than a constant, because the credential is per request: the token comes from the page's
 * own `params` and there is no cookie behind it (ADR 0040). Each action takes the token first, so binding is
 * what turns `(token, planId, …)` into the `(planId, …)` shapes the manager's props declare.
 *
 * Binding puts the token into the Flight payload of the page that hands these down. That is admitted for
 * **one** token — the visitor's own, already in the address bar they arrived by — and it is what
 * `app/s/[token]/page.test.tsx` proves by calling every handed action and reading the token it carries,
 * token by token against every one the API serves. No other token is bound here, and none is read from
 * anywhere but the caller's argument.
 *
 * Wired whatever the seat's role, because a control is a rendering answer and a grant is the API's: a `view`
 * seat handed this object may still administer nothing, and what stops it is the 403 rather than an absent
 * member.
 */
export const seatSeatActions = (token: string): SeatManagerActions => ({
  list: seatReadSeats.bind(null, token),
  create: seatCreateSeat.bind(null, token),
  update: seatUpdateSeat.bind(null, token),
  revoke: seatRevokeSeat.bind(null, token),
})

/**
 * The three plan-level writes with one share token bound in.
 *
 * The same binding as {@link seatSeatActions} and the same argument for why it is safe. There is no
 * `create`: `workspace:create-plan` is admin-only (ADR 0009), so a seat is refused a new plan whatever its
 * role, and a member here would be a control that cannot work.
 *
 * `remove` is the sharpest of the three, because deleting a plan revokes every seat on it — this one
 * included. `seatDeletePlan` therefore redirects to `/s/unavailable` rather than to an index a seat cannot
 * reach.
 */
export const seatPlanOwnActions = (token: string): SeatPlanOwnActions => ({
  rename: seatRenamePlan.bind(null, token),
  retime: seatRetimePlan.bind(null, token),
  remove: seatDeletePlan.bind(null, token),
})
