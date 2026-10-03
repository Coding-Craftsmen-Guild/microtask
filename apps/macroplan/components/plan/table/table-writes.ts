import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { FeaturePlace, ItemPlace } from '../canvas/drag-places'
import type { SizeWrites } from '../canvas/size-write'
import type { TableWrites } from './plan-table'
import type { CreateWrites } from '../board/create-write'
import type { DrawGesture, GestureWrites, PlanGestures } from '../store/gestures'
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
 * The **raw** writes the board's two chained gestures send, each `null` where this viewer may not make it.
 *
 * Raw rather than optimistic, because a gesture's chain runs as the `send` of one op inside the plan store,
 * and an optimistic write there would queue behind the very op waiting for it (`../store/gestures.ts`).
 *
 * `reorderEpic` is here because a dropped rail is **two** calls: the create route appends, and the drop is
 * about where. A viewer who may create a rail but not reorder one gets the pill and a rail at the bottom,
 * which is the honest outcome of the capabilities they hold. `actions` is `null` on a surface handed no
 * writes at all, and every member is then `null` — which draws no strip.
 *
 * @param actions - The raw Server Actions, or `null`.
 * @param content - What this surface may do.
 * @returns The writes the gestures chain.
 */
export const gestureWritesFor = (actions: PlanEditActions | null, content: PlanContentControls): GestureWrites => ({
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

const NO_GESTURES: PlanGestures = { draw: null, dropRail: null, offers: { feature: false, item: false } }

const held = <T,>(actions: PlanEditActions | null, allowed: boolean, pick: (all: PlanEditActions) => T): T | null =>
  actions === null || !allowed ? null : pick(actions)

/** Every write the board surface holds, assembled once so a caller cannot hand over some and not others. */
export interface BoardWrites {
  /** What the Add strip drops: the two gestures, and the reorder a dragged rail is. */
  readonly adds: CreateWrites

  /** Which pills the strip offers, read off the gestures so a pill is drawn exactly when its write is there. */
  readonly offers: { readonly epic: boolean; readonly feature: boolean; readonly item: boolean }

  /** What a draw from a mark's own end does: the draw gesture, or `null` where nothing may be added. */
  readonly draw: DrawGesture | null

  /** What a dragged bar's drop sends, or `null` where this surface may not move one. */
  readonly place: FeaturePlace | null

  /** What a dragged item's drop sends, or `null` where this surface may not move one. */
  readonly placeItem: ItemPlace | null

  /** What a Ctrl-held drag of a mark's end sends. */
  readonly size: SizeWrites
}

/**
 * The board's writes, gated together.
 *
 * One record rather than props threaded side by side, because they are one question — what may this
 * surface change about the board — and separate hand-overs are chances to add a gesture and forget to pass
 * the write that makes it work. Each member is still gated on its own capability, so the grouping is in
 * the plumbing and never in the permissions.
 *
 * `actions` are the **optimistic** writes (`../store/optimistic-actions.ts`): a drag, a reorder and a
 * resize are one write each and move on screen the moment they are made. `gestures` are the two that write
 * more than once, already gated on the raw writes they chain.
 *
 * @param actions - The optimistic writes, or `null` for a surface with no credential at all.
 * @param gestures - The chained gestures, or `null` with them.
 * @param content - What this surface may do.
 * @returns The board's writes, each `null` wherever a capability is absent.
 */
export const boardWritesFor = (
  actions: PlanEditActions | null,
  gestures: PlanGestures | null,
  content: PlanContentControls,
): BoardWrites => {
  const made = gestures ?? NO_GESTURES
  return {
    adds: { draw: made.draw, dropRail: made.dropRail, reorderEpic: held(actions, content.reorderEpic, (one) => one.reorderEpic) },
    offers: { epic: made.dropRail !== null, ...made.offers },
    draw: made.draw,
    place: held(actions, content.placeFeature, (one) => one.placeFeature),
    placeItem: held(actions, content.placeItem, (one) => one.placeItem),
    size: sizesFor(actions, content),
  }
}
