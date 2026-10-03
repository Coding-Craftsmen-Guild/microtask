import { bindEpic, createTask, linkItem, unbindEpic, unlinkItem } from '../../actions/bridge'
import {
  createEpic,
  recolourEpic,
  removeEpic,
  renameEpic,
  reorderEpic,
} from '../../actions/epics'
import {
  createFeature,
  estimateFeature,
  pinFeature,
  placeFeature,
  removeFeature,
  renameFeature,
  setDependencies,
} from '../../actions/features'
import {
  createItem,
  describeItem,
  estimateItem,
  placeItem,
  removeItem,
  renameItem,
} from '../../actions/items'
import {
  createLabel,
  labelFeature,
  recolourLabel,
  removeLabel,
  renameLabel,
} from '../../actions/labels'
import {
  createPlanSeat,
  readPlanSeats,
  revokePlanSeat,
  updatePlanSeat,
} from '../../actions/plan-share-links'
import { deletePlan, renamePlan, retimePlan } from '../../actions/plans'
import type { PlanOwnWrites } from './app/manage-menus'
import type { PlanEditActions } from './edit-actions'
import type { PlanSeatActions } from './share/use-plan-seats'

/**
 * Every structural write of a plan, each carrying the **admin** authority `mp_admin` names.
 *
 * One object a page wires rather than a prop per action, so a surface gains an action without every
 * page that renders it gaining an argument — and so the seat page can wire its own object of
 * link-authority actions into the same components. The components take {@link PlanEditActions} and
 * import none of this.
 *
 * The names are the actions' own, so a member wired to the like-named action of another entity is a
 * failure of `admin-actions.test.ts` rather than a silence: `renameFeature` and `renameItem` have
 * the same three parameter types, and swapping them typechecks.
 */
export const ADMIN_PLAN_ACTIONS: PlanEditActions = {
  createEpic,
  renameEpic,
  recolourEpic,
  reorderEpic,
  removeEpic,
  createLabel,
  renameLabel,
  recolourLabel,
  removeLabel,
  labelFeature,
  createFeature,
  renameFeature,
  estimateFeature,
  pinFeature,
  placeFeature,
  setDependencies,
  removeFeature,
  createItem,
  renameItem,
  estimateItem,
  describeItem,
  placeItem,
  removeItem,
  bindEpic,
  unbindEpic,
  linkItem,
  unlinkItem,
  createTask,
}

/**
 * The admin's writes to the plan itself — rename, retime, delete — as one record for the plan screen.
 *
 * `PlanApp` puts the retime through its store so a new start date redraws the timeline at once; rename and
 * delete stay as they are, because the name is also drawn on the server (the crumb, the tab title) and a
 * delete leaves the page.
 */
export const ADMIN_OWN_WRITES: PlanOwnWrites = { rename: renamePlan, retime: retimePlan, remove: deletePlan }

/** The admin's seat writes, under the names the share manager calls them by. */
export const ADMIN_SEAT_ACTIONS: PlanSeatActions = {
  list: readPlanSeats,
  create: createPlanSeat,
  update: updatePlanSeat,
  revoke: revokePlanSeat,
}
