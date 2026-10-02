import { orNoAnswer } from '@repo/app-session/no-answer'
import type { Answer } from './extend-write'
import type { SizeDraft } from './size-view'

/** The two writes a resize spends, each `null` where this surface may not make it. */
export interface SizeWrites {
  /** Re-estimates one feature. */
  readonly estimateFeature: ((planId: string, featureId: string, days: number) => Answer) | null

  /** Re-estimates one item. */
  readonly estimateItem: ((planId: string, itemId: string, days: number) => Answer) | null
}

/** Whether this surface may resize anything at all, which is what decides the handles are offered. */
export const maySize = (writes: SizeWrites): boolean =>
  writes.estimateFeature !== null || writes.estimateItem !== null

/**
 * Writes a dragged-out length: one call, to the one action that owns the mark's estimate.
 *
 * ### Why a resize is an estimate and not a date
 *
 * Nothing on this board stores where a mark sits. A feature's days come from the forward pass over rail
 * order, dependencies and pins, and an item's from its place in its feature — so there is no "move the
 * end of this to the 14th" to write, and the only thing a drag can be saying is *how long the work is*.
 * That is `estimateDays`, which is also what the drawer's own stepper writes, so the gesture is a second
 * way to say what a field already says rather than a second place the number can live (`./extend-write.ts`
 * makes the same argument for the draw).
 *
 * The consequence is worth stating because a reader will see it: dragging a **start** handle leftwards
 * lengthens the work, and the mark does not then begin earlier unless the schedule has room for it to.
 * `./size-view.ts` carries that, and the chip says the length rather than a date for the same reason.
 *
 * A surface that may not make the one call this draft needs writes nothing, and that is a rendering
 * answer and not a gate — the action is still what refuses.
 *
 * @param planId - The plan the write is addressed at.
 * @param draft - What to resize and how long it now is.
 * @param writes - The actions this surface holds.
 */
export async function writeSize(
  planId: string,
  draft: SizeDraft,
  writes: SizeWrites,
): Promise<void> {
  const write = draft.kind === 'item' ? writes.estimateItem : writes.estimateFeature
  if (write === null) return
  await orNoAnswer(write)(planId, draft.subjectId, draft.days)
}
