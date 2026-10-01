import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { TableWrites } from './plan-table'
import type { CreateWrites } from '../board/create-write'
import type { PlanEditActions } from '../edit-actions'

/**
 * What the table's actions column offers this viewer, out of the capabilities they hold.
 *
 * Three booleans rather than the twenty-odd `PlanContentControls` holds, because the column has three
 * links and each of them is a question about a **kind** of write rather than about one action: a row may
 * be an item or a feature, and `Delete` means either `item:remove` or `feature:remove` depending on
 * which row it is on. Collapsing them here keeps that reasoning in one place and keeps the table from
 * taking a capabilities record it would then have to interpret.
 *
 * It is deliberately generous in the `or` direction and the reason is worth stating: a viewer who may
 * remove an item but not a feature is offered the link on both rows, and the feature's own drawer then
 * draws no delete control for them. The alternative is a column whose contents differ row by row for a
 * distinction no product has yet drawn, and a link to a panel that shows fewer controls is a smaller
 * surprise than a column that flickers between two and three links as a reader's eye goes down it.
 */
export const writesFor = (content: PlanContentControls): TableWrites => ({
  add: content.createItem,
  remove: content.removeFeature || content.removeItem,
  rename: content.renameFeature || content.renameItem,
})

/**
 * Which of the Add strip's four writes this viewer may make, each `null` where they may not.
 *
 * ### Why a `null` per write rather than a boolean per pill
 *
 * A pill that is drawn and refuses a drop is worse than one that is not drawn, so the strip asks the
 * same question the drop does — *is there a function for this?* — and gets one answer. Threading a
 * boolean beside each function would be the same fact twice, with the failure mode of a pill offered
 * for a write that is not there.
 *
 * `reorderEpic` has no pill of its own and is here because an epic drop is **two** calls: the create
 * route appends, and the drop is about where. A viewer who may create a rail but not reorder one gets
 * the pill and a rail at the bottom, which is the honest outcome of the capabilities they hold.
 *
 * `actions` is `null` on a surface handed no writes at all, and every member is then `null` — which
 * is what draws no strip.
 */
export const addsFor = (
  actions: PlanEditActions | null,
  content: PlanContentControls,
): CreateWrites => ({
  createEpic: actions !== null && content.createEpic ? actions.createEpic : null,
  reorderEpic: actions !== null && content.reorderEpic ? actions.reorderEpic : null,
  createFeature: actions !== null && content.createFeature ? actions.createFeature : null,
  createItem: actions !== null && content.createItem ? actions.createItem : null,
})
