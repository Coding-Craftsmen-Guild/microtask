import {
  seatCreateEpic,
  seatCreateFeature,
  seatCreateItem,
  seatDescribeItem,
  seatEstimateFeature,
  seatEstimateItem,
  seatPinFeature,
  seatPlaceFeature,
  seatPlaceItem,
  seatRecolourEpic,
  seatRemoveEpic,
  seatRemoveFeature,
  seatRemoveItem,
  seatRenameEpic,
  seatRenameFeature,
  seatRenameItem,
  seatReorderEpic,
  seatSetDependencies,
} from '../../actions/seat-writes'
import type { PlanEditActions } from './edit-actions'

/**
 * Every structural write of a plan, each carrying the authority of one **share token**.
 *
 * The same {@link PlanEditActions} the admin surface satisfies, so one set of components serves both
 * audiences and no component decides whose credential a write goes out under — that is the whole
 * point of the prop, and it is why this is a second wiring rather than a second set of components.
 *
 * A factory rather than a constant, because the credential is per request: the token comes from the
 * page's own `params` and there is no cookie behind it (ADR 0040). The interface's members take
 * `(planId, …)` and every seat action takes the token first, so the token is **bound in** here.
 * What that costs is what `apps/microtask/components/link/link-actions.ts` records: binding puts the
 * token into the Flight payload of whatever page hands these down, where it is the visitor's own and
 * already in their address bar — the one token an `/s/*` response may carry. No other token is bound
 * here, and none is read from anywhere but the caller's argument.
 *
 * Wired whatever role the seat holds, because a control is a rendering answer and a grant is the
 * API's: a `view` seat handed this object still may write nothing, and what stops it is the 403 the
 * API answers rather than an absent member. `actions/seat-writes.ts` holds that argument in full.
 *
 * The member names cannot be checked against the actions' own, as `admin-actions.test.ts` checks the
 * admin wiring: `bind` names its result `"bound seatRenameFeature"`, so no bound member's `.name`
 * can equal its key. `seat-actions.test.ts` calls every member instead and asserts which action
 * received the call and that the token arrived first — which catches the swap a name comparison
 * catches, and one it does not.
 */
export const seatPlanActions = (token: string): PlanEditActions => ({
  createEpic: seatCreateEpic.bind(null, token),
  renameEpic: seatRenameEpic.bind(null, token),
  recolourEpic: seatRecolourEpic.bind(null, token),
  reorderEpic: seatReorderEpic.bind(null, token),
  removeEpic: seatRemoveEpic.bind(null, token),
  createFeature: seatCreateFeature.bind(null, token),
  renameFeature: seatRenameFeature.bind(null, token),
  estimateFeature: seatEstimateFeature.bind(null, token),
  pinFeature: seatPinFeature.bind(null, token),
  placeFeature: seatPlaceFeature.bind(null, token),
  setDependencies: seatSetDependencies.bind(null, token),
  removeFeature: seatRemoveFeature.bind(null, token),
  createItem: seatCreateItem.bind(null, token),
  renameItem: seatRenameItem.bind(null, token),
  estimateItem: seatEstimateItem.bind(null, token),
  describeItem: seatDescribeItem.bind(null, token),
  placeItem: seatPlaceItem.bind(null, token),
  removeItem: seatRemoveItem.bind(null, token),
})
