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
import type { PlanEditActions } from './edit-actions'

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
}
