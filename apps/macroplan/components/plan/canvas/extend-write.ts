import type { FeaturePlacement, ItemPlacement, NewFeature, NewItem } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import type { ActionResult } from '../../../actions/result'
import { DRAWN_NAMES, type Draft } from './extend-view'
import type { PlanScreenModel } from '../plan-screen-model'

/** What every write on this board answers: the whole recomputed plan, or a refusal. */
export type Answer = Promise<ActionResult<PlanScreenModel>>

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

type Answered = ActionResult<PlanScreenModel>

/** Hears each plan a chain is answered with on its way, so a refusal part-way keeps what was stored. */
export type Confirm = (plan: PlanScreenModel) => void

/** Hears the id each create in the chain was answered with, the moment it is. */
export type Made = (kind: 'feature' | 'item', id: string) => void

const unheard: Confirm = () => undefined

const unnamed: Made = () => undefined

const itemMade = async (create: () => Answer, made: Made): Answer => {
  const answer = await create()
  const id = answer.ok ? answer.value.items.at(-1)?.id : undefined
  if (id !== undefined) made('item', id)
  return answer
}

const edgesOf = (answer: Answered, featureId: string): readonly string[] =>
  answer.ok ? (answer.value.features.find((one) => one.id === featureId)?.dependsOn ?? []) : []

/** What one release drew, and the plan it is addressed at. */
export interface DrawnWrite extends Draft {
  /** The plan every write is addressed at. */
  readonly planId: string
}

interface Steps {
  readonly draft: DrawnWrite
  readonly made: string
  readonly answer: Answered
  readonly writes: ExtendWrites
  readonly named: Made
}

const edgeStep = ({ draft, made, answer, writes }: Steps): (() => Answer) | null => {
  const { setDependencies } = writes
  if (setDependencies === null || draft.edge === 'none') return null
  const waits = draft.edge === 'new-waits' ? made : draft.featureId
  const on = draft.edge === 'new-waits' ? draft.featureId : made
  return () => orNoAnswer(setDependencies)(draft.planId, waits, [...edgesOf(answer, waits), on])
}

const featureSteps = (steps: Steps): readonly (() => Answer)[] => {
  const { draft, made, writes, named } = steps
  const { placeFeature, labelFeature, createItem } = writes
  const at = { epicId: draft.epicId, position: draft.position }
  const item = { estimateDays: draft.days, featureId: made, name: DRAWN_NAMES.item }
  return [
    placeFeature === null ? null : () => orNoAnswer(placeFeature)(draft.planId, made, at),
    draft.labelId === '' || labelFeature === null ? null : () => orNoAnswer(labelFeature)(draft.planId, made, draft.labelId),
    createItem === null ? null : () => itemMade(() => orNoAnswer(createItem)(draft.planId, item), named),
    edgeStep(steps),
  ].filter((step) => step !== null)
}

const following = async (first: Answered, steps: readonly (() => Answer)[], confirm: Confirm): Promise<Answered> => {
  let last = first
  for (const step of steps) {
    if (!last.ok) return last
    confirm(last.value)
    last = await step()
  }
  return last
}

interface Heard {
  readonly confirm: Confirm
  readonly named: Made
}

const addItem = async (draft: DrawnWrite, writes: ExtendWrites, { confirm, named }: Heard): Promise<Answered | null> => {
  const { createItem, placeItem } = writes
  if (createItem === null) return null
  const item = { estimateDays: draft.days, featureId: draft.featureId, name: DRAWN_NAMES.item }
  const made = await itemMade(() => orNoAnswer(createItem)(draft.planId, item), named)
  const id = made.ok ? made.value.items.at(-1)?.id : undefined
  if (id === undefined || placeItem === null) return made
  const at = { featureId: draft.featureId, position: draft.position }
  return following(made, [() => orNoAnswer(placeItem)(draft.planId, id, at)], confirm)
}

const addFeature = async (draft: DrawnWrite, writes: ExtendWrites, { confirm, named }: Heard): Promise<Answered | null> => {
  const { createFeature } = writes
  if (createFeature === null) return null
  const answer = await orNoAnswer(createFeature)(draft.planId, {
    epicId: draft.epicId,
    estimateDays: draft.days,
    name: DRAWN_NAMES.feature,
    pinSprint: draft.sprint,
  })
  const made = answer.ok ? answer.value.features.at(-1)?.id : undefined
  if (made === undefined) return answer
  named('feature', made)
  return following(answer, featureSteps({ answer, draft, made, writes, named }), confirm)
}

/**
 * The writes one release makes, in the order a reader would describe them, and the last answer they got.
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
 * ### Why it answers, and what `confirm` hears
 *
 * The chain is the `send` of **one** optimistic op (`../store/gestures.ts`), so the whole drawing is on
 * screen the moment the pointer is let go and these writes only persist it (ADR 0069). The answer is the
 * last one the chain got, which the store confirms; a step that is refused stops the chain there, and the
 * plan `confirm` heard before it is what the store keeps — the feature the create did store stays on the
 * board even though its edge was refused.
 *
 * `made` hears the id each create was answered with, as soon as it is: the store drew the feature and its
 * item under placeholders, and anything the reader did to them while the chain was out was queued under
 * those, so it is what lets those writes go out under ids the API knows (`../store/plan-store.ts`).
 *
 * @param draft - What the release drew, and the plan it is addressed at.
 * @param writes - The actions this surface holds, each `null` where it may not.
 * @param confirm - Hears each plan the chain was answered with before its last step.
 * @param made - Hears the id of the feature and the item the chain created.
 * @returns The last answer, or `null` where the surface may not create what was drawn.
 */
export async function writeDraw(
  draft: DrawnWrite,
  writes: ExtendWrites,
  confirm: Confirm = unheard,
  made: Made = unnamed,
): Promise<Answered | null> {
  const heard = { confirm, named: made }
  return draft.kind === 'item' ? addItem(draft, writes, heard) : addFeature(draft, writes, heard)
}
