import type { NewEpic } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import type { ActionResult } from '../../../actions/result'
import type { Draft } from '../canvas/extend-view'
import { writeDraw, type Answer, type ExtendWrites } from '../canvas/extend-write'
import type { PlanScreenModel } from '../plan-screen-model'
import { drawEdit, railDropEdit, type DrawMay } from './draw-edits'
import { placeholderId } from './optimistic-actions'
import type { PlanOp } from './plan-store'

/** The raw writes the two gestures chain: the draw's six, and the rail drop's two. */
export interface GestureWrites extends ExtendWrites {
  readonly createEpic: ((planId: string, epic: NewEpic) => Answer) | null
  readonly reorderEpic: ((planId: string, epicId: string, railOrder: number) => Answer) | null
}

/** Put drawn work on the plan: a feature or an item, drawn from a mark or dropped from the strip. */
export type DrawGesture = (draft: Draft) => Promise<void>

/** Put a new rail in a gap; resolves with its id once the API has minted one, or `null`. */
export type RailGesture = (epic: NewEpic, gap: number) => Promise<string | null>

/** The board's two gestures that write more than once. */
export interface PlanGestures {
  readonly draw: DrawGesture
  readonly dropRail: RailGesture
}

type Run = (op: PlanOp) => Promise<ActionResult<PlanScreenModel>>

const UNSENT: ActionResult<PlanScreenModel> = { ok: false, status: 403, detail: 'This surface may not add that.' }

const mayOf = (writes: ExtendWrites): DrawMay => ({
  placeFeature: writes.placeFeature !== null,
  placeItem: writes.placeItem !== null,
  labelFeature: writes.labelFeature !== null,
  createItem: writes.createItem !== null,
  setDependencies: writes.setDependencies !== null,
})

const drawing =
  (planId: string, writes: GestureWrites, run: Run): DrawGesture =>
  async (draft) => {
    if ((draft.kind === 'item' ? writes.createItem : writes.createFeature) === null) return
    const ids = { feature: placeholderId(), item: placeholderId() }
    const may = mayOf(writes)
    await run({
      apply: (plan) => drawEdit(plan, draft, ids, may),
      send: async (confirm) => (await writeDraw({ ...draft, planId }, writes, confirm)) ?? UNSENT,
    })
  }

const dropping =
  (planId: string, writes: GestureWrites, run: Run): RailGesture =>
  async (epic, gap) => {
    const { createEpic, reorderEpic } = writes
    if (createEpic === null) return null
    const id = placeholderId()
    const minted: { id: string | null } = { id: null }
    await run({
      apply: (plan) => railDropEdit(plan, epic, reorderEpic === null ? null : gap, id),
      send: async (confirm) => {
        const created = await orNoAnswer(createEpic)(planId, epic)
        minted.id = created.ok ? (created.value.epics.at(-1)?.id ?? null) : null
        if (!created.ok || minted.id === null || reorderEpic === null) return created
        confirm(created.value)
        return orNoAnswer(reorderEpic)(planId, minted.id, gap)
      },
    })
    return minted.id
  }

/**
 * The board's two chained gestures, each one change in the store rather than one per write (ADR 0069).
 *
 * A draw writes up to five times and a rail drop twice, each later write needing the id the first one
 * answered with, so step by step the new work would appear at the end of its rail and then walk to where
 * it was put, a round trip a step. Here each is a single op: its edit is the whole gesture
 * (`./draw-edits.ts`), on screen at once, and its send is the chain the gesture always ran, persisting it
 * in the background. A refusal part-way keeps what the chain did store, and says why.
 *
 * The writes are the **raw** Server Actions, never the optimistic ones: the chain runs inside the store's
 * queue, and an optimistic write there would queue behind the very op that is waiting for it.
 *
 * @param planId - The plan the writes are addressed at.
 * @param writes - The raw writes this surface holds, each `null` where it may not.
 * @param run - The store's `run`.
 * @returns The two gestures.
 */
export const planGestures = (planId: string, writes: GestureWrites, run: Run): PlanGestures => ({
  draw: drawing(planId, writes, run),
  dropRail: dropping(planId, writes, run),
})
