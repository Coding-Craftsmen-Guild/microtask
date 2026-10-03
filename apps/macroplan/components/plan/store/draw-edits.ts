import type { NewEpic } from '@repo/api-client'
import { DRAWN_NAMES, type Draft } from '../canvas/extend-view'
import type { PlanScreenModel } from '../plan-screen-model'
import { addFeature, dependFeature, labelFeature, placeFeature } from './feature-edits'
import { addItem, placeItem } from './item-edits'
import { addRail, reorderRail } from './rail-edits'

/** Which of the writes a draw makes this surface may make, so the edit does exactly what the chain will. */
export interface DrawMay {
  readonly placeFeature: boolean
  readonly placeItem: boolean
  readonly labelFeature: boolean
  readonly createItem: boolean
  readonly setDependencies: boolean
}

/** The placeholder ids a draw creates under until its answers name the real ones. */
export interface DrawIds {
  readonly feature: string
  readonly item: string
}

const edged = (plan: PlanScreenModel, draft: Draft, made: string): PlanScreenModel => {
  if (draft.edge === 'none') return plan
  const waits = draft.edge === 'new-waits' ? made : draft.featureId
  const on = draft.edge === 'new-waits' ? draft.featureId : made
  const held = plan.features.find((one) => one.id === waits)?.dependsOn ?? []
  return dependFeature(plan, waits, [...held, on])
}

const drawnItem = (plan: PlanScreenModel, draft: Draft, ids: DrawIds, may: DrawMay): PlanScreenModel => {
  const added = addItem(plan, { featureId: draft.featureId, name: DRAWN_NAMES.item, estimateDays: draft.days }, ids.item)
  return may.placeItem ? placeItem(added, ids.item, { featureId: draft.featureId, position: draft.position }) : added
}

/**
 * Everything one draw writes, applied at once: the whole result of the gesture in the frame it ends in.
 *
 * A draw is a **chain** on the server — create, then place, then group, then a first item, then an edge
 * (`../canvas/extend-write.ts`) — because each later write needs the id the create answers with. Applied
 * step by step, the new bar would appear at the end of its rail and then walk to where it was drawn, one
 * round trip per step. This is the same chain as one pure edit, each step guarded by the permission the
 * chain is guarded by, so what appears is what the chain will have stored when it finishes (ADR 0069).
 *
 * @param plan - The plan as it stands.
 * @param draft - What was drawn.
 * @param ids - The placeholders to create under.
 * @param may - Which of the chain's writes this surface may make.
 * @returns The plan with the drawn work on it.
 */
export function drawEdit(plan: PlanScreenModel, draft: Draft, ids: DrawIds, may: DrawMay): PlanScreenModel {
  if (draft.kind === 'item') return drawnItem(plan, draft, ids, may)
  const created = { epicId: draft.epicId, name: DRAWN_NAMES.feature, estimateDays: draft.days, pinSprint: draft.sprint }
  let next = addFeature(plan, created, ids.feature)
  if (may.placeFeature) next = placeFeature(next, ids.feature, { epicId: draft.epicId, position: draft.position })
  if (draft.labelId !== '' && may.labelFeature) next = labelFeature(next, ids.feature, draft.labelId)
  const item = { featureId: ids.feature, name: DRAWN_NAMES.item, estimateDays: draft.days }
  if (may.createItem) next = addItem(next, item, ids.item)
  return may.setDependencies ? edged(next, draft, ids.feature) : next
}

/**
 * A rail dropped from the strip: created, then moved to the gap it landed in.
 *
 * The same two-write chain as `../board/create-write.ts`, as one edit. `gap` is `null` on a surface that
 * may create a rail and may not reorder one, where the chain makes the first write only.
 *
 * @param plan - The plan as it stands.
 * @param epic - What the create sends.
 * @param gap - The rail order it lands at, or `null`.
 * @param id - The placeholder id.
 * @returns The plan with the rail on it.
 */
export function railDropEdit(plan: PlanScreenModel, epic: NewEpic, gap: number | null, id: string): PlanScreenModel {
  const added = addRail(plan, epic, id)
  return gap === null ? added : reorderRail(added, id, gap)
}
