import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { FeaturePlace } from '../canvas/drag-places'
import type { SizeWrites } from '../canvas/size-write'
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
  ...drawsFor(actions, content),
  createEpic: actions !== null && content.createEpic ? actions.createEpic : null,
  reorderEpic: actions !== null && content.reorderEpic ? actions.reorderEpic : null,
})

/**
 * The two writes a **resize** sends, each gated on its own capability.
 *
 * Beside {@link drawsFor} and not inside it, because they are a different gesture under different
 * permissions: Ctrl held over a mark resizes what is there, where a plain drag of a handle creates
 * something new (`canvas/size-write.ts`). A seat may hold either without the other, and one record would
 * make that one answer.
 *
 * @param actions - Every write, or `null` for a surface with no credential at all.
 * @param content - What this surface may do.
 * @returns One record per action, `null` where it may not.
 */
export const sizesFor = (
  actions: PlanEditActions | null,
  content: PlanContentControls,
): SizeWrites => ({
  estimateFeature: actions !== null && content.estimateFeature ? actions.estimateFeature : null,
  estimateItem: actions !== null && content.estimateItem ? actions.estimateItem : null,
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

/** Every write the board surface holds, assembled once so a caller cannot hand over some and not others. */
export interface BoardWrites {
  /** What the Add strip drops, which is a draw's writes plus the two a rail needs. */
  readonly adds: CreateWrites

  /** What a draw from a mark's own end sends. */
  readonly draw: ExtendWrites

  /** What a dragged bar's drop sends, or `null` where this surface may not move one. */
  readonly place: FeaturePlace | null

  /** What a Ctrl-held drag of a mark's end sends. */
  readonly size: SizeWrites
}

/**
 * The four, gated together.
 *
 * One record rather than four props threaded side by side, because they are one question — what may this
 * surface change about the board — and four separate hand-overs are four chances to add a gesture and
 * forget to pass the write that makes it work. Each member is still gated on its own capability, so the
 * grouping is in the plumbing and never in the permissions.
 *
 * @param actions - Every write, or `null` for a surface with no credential at all.
 * @param content - What this surface may do.
 * @returns The four records, each with `null` wherever a capability is absent.
 */
export const boardWritesFor = (
  actions: PlanEditActions | null,
  content: PlanContentControls,
): BoardWrites => ({
  adds: addsFor(actions, content),
  draw: drawsFor(actions, content),
  place: actions !== null && content.placeFeature ? actions.placeFeature : null,
  size: sizesFor(actions, content),
})
