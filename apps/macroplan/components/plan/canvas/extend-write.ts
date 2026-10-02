import type { FeaturePlacement, ItemPlacement, NewFeature, NewItem, Plan } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import type { ActionResult } from '../../../actions/result'
import { DRAWN_NAMES, type Draft } from './extend-view'

/** What every write on this board answers: the whole recomputed plan, or a refusal. */
export type Answer = Promise<ActionResult<Plan>>

/** Every write a draw on the board can make, each `null` where this surface may not make it. */
export interface ExtendWrites {
  /** Add a feature to a rail. */
  readonly createFeature: ((planId: string, feature: NewFeature) => Answer) | null

  /** Add an item to a feature. */
  readonly createItem: ((planId: string, item: NewItem) => Answer) | null

  /** Order a feature among the features of its rail. */
  readonly placeFeature: ((planId: string, featureId: string, to: FeaturePlacement) => Answer) | null

  /** Order an item among the items of its feature. */
  readonly placeItem: ((planId: string, itemId: string, to: ItemPlacement) => Answer) | null

  /** Replace a feature's whole list of dependencies. */
  readonly setDependencies:
    | ((planId: string, featureId: string, dependsOn: readonly string[]) => Answer)
    | null

  /** Put a feature in a group, or take it out of one. */
  readonly labelFeature: ((planId: string, featureId: string, labelId: string | null) => Answer) | null
}

/** Whether this surface may draw at all, which is the two creates and nothing else. */
export const mayExtend = (writes: ExtendWrites): boolean =>
  writes.createFeature !== null || writes.createItem !== null

const addedFeature = (answer: ActionResult<Plan>): string | null =>
  answer.ok ? (answer.value.features.at(-1)?.id ?? null) : null

const addedItem = (answer: ActionResult<Plan>): string | null =>
  answer.ok ? (answer.value.items.at(-1)?.id ?? null) : null

const edgesOf = (answer: ActionResult<Plan>, featureId: string): readonly string[] =>
  answer.ok ? (answer.value.features.find((one) => one.id === featureId)?.dependsOn ?? []) : []

const writeEdge = async (
  draft: DrawnWrite,
  made: string,
  answer: ActionResult<Plan>,
  writes: ExtendWrites,
): Promise<void> => {
  const { setDependencies } = writes
  if (setDependencies === null || draft.edge === 'none') return
  const waits = draft.edge === 'new-waits' ? made : draft.featureId
  const on = draft.edge === 'new-waits' ? draft.featureId : made
  await orNoAnswer(setDependencies)(draft.planId, waits, [...edgesOf(answer, waits), on])
}

/** One draw, as the plan it is addressed at and what it drew. */
export interface DrawnWrite extends Draft {
  /** The plan every write below is addressed at. */
  readonly planId: string
}

const addItem = async (draft: DrawnWrite, writes: ExtendWrites): Promise<void> => {
  const { createItem, placeItem } = writes
  if (createItem === null) return
  const made = await orNoAnswer(createItem)(draft.planId, {
    estimateDays: draft.days,
    featureId: draft.featureId,
    name: DRAWN_NAMES.item,
  })
  const id = addedItem(made)
  if (id === null || placeItem === null) return
  await orNoAnswer(placeItem)(draft.planId, id, {
    featureId: draft.featureId,
    position: draft.position,
  })
}

const addFeature = async (draft: DrawnWrite, writes: ExtendWrites): Promise<void> => {
  const { createFeature, placeFeature, createItem, labelFeature } = writes
  if (createFeature === null) return
  const made = await orNoAnswer(createFeature)(draft.planId, {
    epicId: draft.epicId,
    estimateDays: draft.days,
    name: DRAWN_NAMES.feature,
    pinSprint: draft.sprint,
  })
  const id = addedFeature(made)
  if (id === null) return
  if (placeFeature !== null) {
    await orNoAnswer(placeFeature)(draft.planId, id, {
      epicId: draft.epicId,
      position: draft.position,
    })
  }
  if (draft.labelId !== '' && labelFeature !== null) {
    await orNoAnswer(labelFeature)(draft.planId, id, draft.labelId)
  }
  if (createItem !== null) {
    await orNoAnswer(createItem)(draft.planId, {
      estimateDays: draft.days,
      featureId: id,
      name: DRAWN_NAMES.item,
    })
  }
  await writeEdge(draft, id, made, writes)
}

/**
 * The writes one release makes, in the order a reader would describe them.
 *
 * A create, then a placement, then the group, then the item that carries the estimate, then the edge.
 * Every one of them is an **existing** action: nothing about drawing on the board is a new route, which
 * is the whole reason this gesture is cheap — the server already knows how to add a feature after
 * another one on a rail, and this is a second way of saying it.
 *
 * Each step is skipped rather than refused where the surface may not make it, so a seat that may create
 * but not reorder gets the feature at the end of the rail instead of nothing at all. The id of what was
 * made is read from the plan the create **answered** with, which is the same mechanism the Add strip uses
 * for a new rail: the API is the only thing that knows the id it minted.
 *
 * A new feature's own estimate and its one item are both the drawn length, so a feature drawn two days
 * long reads as planned 2d and broken down to 2d rather than as a discrepancy nobody authored.
 *
 * @param draft - What the release drew, and the plan it is addressed at.
 * @param writes - The actions this surface holds, each `null` where it may not.
 */
export async function writeDraw(draft: DrawnWrite, writes: ExtendWrites): Promise<void> {
  if (draft.kind === 'item') {
    await addItem(draft, writes)
    return
  }
  await addFeature(draft, writes)
}
