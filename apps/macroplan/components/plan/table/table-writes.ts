import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { TableWrites } from './plan-table'

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
