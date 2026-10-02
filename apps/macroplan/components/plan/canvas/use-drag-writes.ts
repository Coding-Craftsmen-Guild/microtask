import { orNoAnswer } from '@repo/app-session/no-answer'
import type { DropTarget } from '@repo/canvas'
import { useState } from 'react'
import { MOVED, type Placed, type Said } from './drag-notice'
import type { ItemLanding } from './item-drag'
import type { FeaturePlace, ItemPlace } from './drag-places'

/** What a landed drag sends, and the plan it is addressed at. */
export interface DragWritesQuery {
  readonly planId: string

  /** The feature placement write, or `null` on a surface that may not move a bar. */
  readonly place: FeaturePlace | null

  /** The item placement write, or `null` on a surface that may not move an item. */
  readonly placeItem: ItemPlace | null
}

/** The one line under the canvas, and the three ways something gets written onto it. */
export interface DragWrites {
  /** What the last drag of either kind said, or `null` before either has happened. */
  readonly said: Said | null

  readonly moveFeature: (featureId: string, to: DropTarget, back: DropTarget | null) => void

  readonly moveItem: (itemId: string, to: ItemLanding, back: ItemLanding | null) => void

  /** Send the compensating placement for whichever kind the notice is about. */
  readonly undo: (subjectId: string, back: Placed) => void
}

/**
 * Sending a landed drag, and saying what it did.
 *
 * ### Why one `said` serves two gestures
 *
 * There is one line under the canvas, and it is about **the last thing that happened**. Two notices,
 * one owned by each drag, would stack — and the lower one would be a sentence about a gesture the
 * reader has since replaced, with an Undo that takes back something they are no longer looking at.
 * So the two drags hand their result here and {@link Placed} carries which kind it was, which is also
 * what lets one Undo button send the right one of two different writes.
 *
 * ### Undo, and why it is one step
 *
 * The place a mark held before the drop is read out of the layout the drop was answered against, and an
 * undo is the same write carrying it. It is replaced by the next drag rather than stacked: a history
 * would need every write to be invertible and a delete is not (`../drawer/delete-control.tsx` keeps a
 * confirm for that reason). An undo carries no `back` of its own, which is what makes it one step and
 * not a toggle.
 *
 * A refused write says what it was refused with and offers nothing to take back, because nothing was
 * written.
 *
 * @param query - The plan and the two writes.
 * @returns The sentence, and the three ways to set it.
 */
export function useDragWrites(query: DragWritesQuery): DragWrites {
  const { planId, place, placeItem } = query
  const [said, setSaid] = useState<Said | null>(null)

  const moveFeature = (featureId: string, to: DropTarget, back: DropTarget | null): void => {
    if (place === null) return
    void orNoAnswer(place)(planId, featureId, to).then((answer) => {
      const kept: Placed | null = answer.ok && back !== null ? { kind: 'feature', to: back } : null
      setSaid({ back: kept, subjectId: featureId, text: answer.ok ? MOVED : answer.detail })
    })
  }

  const moveItem = (itemId: string, to: ItemLanding, back: ItemLanding | null): void => {
    if (placeItem === null) return
    void orNoAnswer(placeItem)(planId, itemId, to).then((answer) => {
      const kept: Placed | null = answer.ok && back !== null ? { kind: 'item', to: back } : null
      setSaid({ back: kept, subjectId: itemId, text: answer.ok ? MOVED : answer.detail })
    })
  }

  const undo = (subjectId: string, back: Placed): void => {
    if (back.kind === 'feature') moveFeature(subjectId, back.to, null)
    else moveItem(subjectId, back.to, null)
  }

  return { moveFeature, moveItem, said, undo }
}
