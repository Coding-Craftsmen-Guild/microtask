import type { NewEpic } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import type { ActionResult } from '../../../actions/result'
import type { Draft } from '../canvas/extend-view'
import { writeDraw, type Answer, type ExtendWrites } from '../canvas/extend-write'
import type { PlanScreenModel } from '../plan-screen-model'
import { drawEdit, railDropEdit, type DrawMay } from './draw-edits'
import { placeholderId } from './optimistic-actions'
import type { PlanStore } from './plan-store'

/** The raw writes the two gestures chain: the draw's six, and the rail drop's two. */
export interface GestureWrites extends ExtendWrites {
  readonly createEpic: ((planId: string, epic: NewEpic) => Answer) | null
  readonly reorderEpic: ((planId: string, epicId: string, railOrder: number) => Answer) | null
}

/** Put drawn work on the plan: a feature or an item, drawn from a mark or dropped from the strip. */
export type DrawGesture = (draft: Draft) => Promise<void>

/**
 * Put a new rail in a gap. Resolves at once with the id it is drawn under — a placeholder, which the store
 * reads as the real id once its create is answered — so its drawer can open in the frame it appears in.
 */
export type RailGesture = (epic: NewEpic, gap: number) => Promise<string | null>

/**
 * The board's two gestures that write more than once, each `null` where this surface may not make it.
 *
 * `offers` says which kinds of work the draw may make. It is read off the same raw writes the gesture's
 * chain sends, so the Add strip asks the question the drop asks and gets one answer: a pill is drawn for a
 * kind exactly when the write that makes it is there.
 */
export interface PlanGestures {
  readonly draw: DrawGesture | null
  readonly dropRail: RailGesture | null
  readonly offers: { readonly feature: boolean; readonly item: boolean }
}

/** What the gestures need of the store: its queue, and the ids its placeholders were answered with. */
export type GestureStore = Pick<PlanStore, 'run' | 'real'>

const UNSENT: ActionResult<PlanScreenModel> = { ok: false, status: 403, detail: 'This surface may not add that.' }

const mayOf = (writes: ExtendWrites): DrawMay => ({
  placeFeature: writes.placeFeature !== null,
  placeItem: writes.placeItem !== null,
  labelFeature: writes.labelFeature !== null,
  createItem: writes.createItem !== null,
  setDependencies: writes.setDependencies !== null,
})

const drawnFrom =(draft: Draft, real: (id: string) => string): Draft => ({
  ...draft,
  featureId: real(draft.featureId),
  epicId: real(draft.epicId),
  labelId: real(draft.labelId),
})

const drawing =
  (planId: string, writes: GestureWrites, store: GestureStore): DrawGesture =>
  async (draft) => {
    if ((draft.kind === 'item' ? writes.createItem : writes.createFeature) === null) return
    const ids = { feature: placeholderId(), item: placeholderId() }
    const may = mayOf(writes)
    await store.run({
      apply: (plan) =>
        drawEdit(plan, drawnFrom(draft, store.real), { feature: store.real(ids.feature), item: store.real(ids.item) }, may),
      send: async (confirm, name) =>
        (await writeDraw({ ...drawnFrom(draft, store.real), planId }, writes, confirm, (kind, id) => name(ids[kind], id))) ??
        UNSENT,
    })
  }

const dropping =
  (planId: string, writes: GestureWrites, store: GestureStore): RailGesture =>
  (epic, gap) => {
    const { createEpic, reorderEpic } = writes
    if (createEpic === null) return Promise.resolve(null)
    const id = placeholderId()
    void store.run({
      apply: (plan) => railDropEdit(plan, epic, reorderEpic === null ? null : gap, store.real(id)),
      send: async (confirm, name) => {
        const created = await orNoAnswer(createEpic)(planId, epic)
        const minted = created.ok ? created.value.epics.at(-1)?.id : undefined
        if (!created.ok || minted === undefined) return created
        name(id, minted)
        if (reorderEpic === null) return created
        confirm(created.value)
        return orNoAnswer(reorderEpic)(planId, minted, gap)
      },
    })
    return Promise.resolve(id)
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
 * queue, and an optimistic write there would queue behind the very op that is waiting for it. So the chain
 * does what the optimistic writes do one by one (`./optimistic-actions.ts`): it reads the ids it was drawn
 * from through the store's `real` when it is applied and when it is sent — the mark a draw starts at, or the
 * rail or group it lands in, may itself have been made a moment ago under a placeholder — and it names what
 * it created as each create is answered.
 *
 * @param planId - The plan the writes are addressed at.
 * @param writes - The raw writes this surface holds, each `null` where it may not.
 * @param store - The store's queue, and what its placeholders were answered with.
 * @returns The two gestures.
 */
export const planGestures = (planId: string, writes: GestureWrites, store: GestureStore): PlanGestures => {
  const offers = { feature: writes.createFeature !== null, item: writes.createItem !== null }
  return {
    draw: offers.feature || offers.item ? drawing(planId, writes, store) : null,
    dropRail: writes.createEpic === null ? null : dropping(planId, writes, store),
    offers,
  }
}
