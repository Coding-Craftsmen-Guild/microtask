import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { TableWrites } from './plan-table'
import type { CreateWrites } from '../board/create-write'
import type { ExtendWrites } from '../canvas/extend-write'
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

/**
 * The writes a draw from a mark's own end sends, each gated on its own capability.
 *
 * Six actions rather than the two creates, because one gesture makes a whole piece of work: the create,
 * the placement that puts it where it was drawn, the group it inherits, the item that carries its
 * estimate and the dependency the end it was drawn from implies. Each is `null` where the surface may
 * not make it, and `./extend-write.ts` skips that step rather than refusing the draw — so a seat that may
 * create but not reorder gets the work at the end of the rail instead of nothing.
 *
 * @param actions - Every write, or `null` for a surface with no credential at all.
 * @param content - What this surface may do.
 * @returns One record per action, `null` where it may not.
 */
export const drawsFor = (
  actions: PlanEditActions | null,
  content: PlanContentControls,
): ExtendWrites => {
  const may = <T,>(allowed: boolean, pick: (held: PlanEditActions) => T): T | null =>
    actions === null || !allowed ? null : pick(actions)
  return {
    createFeature: may(content.createFeature, (held) => held.createFeature),
    createItem: may(content.createItem, (held) => held.createItem),
    labelFeature: may(content.labelFeature, (held) => held.labelFeature),
    placeFeature: may(content.placeFeature, (held) => held.placeFeature),
    placeItem: may(content.placeItem, (held) => held.placeItem),
    setDependencies: may(content.setDependencies, (held) => held.setDependencies),
  }
}
