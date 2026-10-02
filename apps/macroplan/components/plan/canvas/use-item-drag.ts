import { scaleFor } from '@repo/canvas'
import { useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import { itemHeldFrom, itemLandingAt, itemUnmoved, type ItemHeld, type ItemLanding } from './item-drag'

const CANVAS = '[data-slot="plan-canvas"]'

/** What the item drag needs: where to look, the scale it was drawn at, and where to send a drop. */
export interface ItemDragQuery {
  readonly frame: RefObject<HTMLDivElement | null>

  readonly pxPerDay: number

  readonly gutter: number

  /** Whether this surface may move an item at all; `false` listens for nothing. */
  readonly enabled: boolean

  /**
   * Send one landed drop: the item, where it goes, and where it came from.
   *
   * The write itself is `./drag-root.tsx`'s, because the **notice** is. One line under the canvas says
   * what the last drag of either kind did, so there is one `said` and it belongs to whoever renders it —
   * a second one owned here would be a second line, about a gesture that is no longer the last.
   */
  readonly onMoved: (itemId: string, to: ItemLanding, back: ItemLanding) => void
}

/** Everything the drag root spends to let an item be moved. */
export interface ItemDragState {
  /** The item being dragged, or `null` while none is. */
  readonly held: ItemHeld | null

  /** Where it would land, or `null` for a pointer over nothing it could join. */
  readonly landing: ItemLanding | null

  /** Take the `pointerdown` if it was on an item; `false` leaves it to the feature drag. */
  readonly start: (event: PointerEvent<HTMLDivElement>) => boolean

  /** Follow the pointer. */
  readonly move: (travelled: { readonly x: number; readonly y: number }) => void

  /** Write what it landed on, and say so. */
  readonly finish: () => void

  /** Forget the drag, writing nothing. */
  readonly cancel: () => void
}

/**
 * Moving an item to another feature, on the same rail or another one, by dragging it.
 *
 * ### Why it is a second gesture beside the feature drag rather than part of it
 *
 * They answer different questions. A feature's drop names a **rail and a place on it**, which
 * `dropTargetFor` computes from a layout of rails; an item's names a **feature and a place in it**,
 * which is a different list in a different coordinate — `./item-drag.ts` carries that arithmetic and
 * the strip's own item drop already asked the same question (`../board/create-drop.ts`).
 *
 * Folding them into one would mean one function whose answer is a union and whose every branch is
 * already written somewhere else. What they do share is the **pointer**, so `./drag-root.tsx` offers the
 * `pointerdown` here first: an item mark sits inside its feature's rail, so without that one grab would
 * begin both gestures and the bar would move with the item.
 *
 * ### What is sent, and what is not
 *
 * Nothing when the drop names no feature — a release over the gap between two features, or past the last
 * rail, is not clamped to the nearest one. Nothing when it names the place the item already holds, which
 * is the no-op `./selection.ts` argues for a feature. One request otherwise, for one item, and the plan
 * that comes back is what the board redraws from.
 *
 * The notice and its undo are `./drag-notice.tsx`'s and are the feature drag's own: an undo is the same
 * `placeItem` carrying the feature and place the item held before the drop, one step deep rather than a
 * history.
 *
 * @param query - Where to look, the scale and the write.
 * @returns The drag, the preview and the four handlers.
 */
export function useItemDrag(query: ItemDragQuery): ItemDragState {
  const { frame, pxPerDay, gutter, enabled, onMoved } = query
  const [held, setHeld] = useState<ItemHeld | null>(null)
  const canvas = useRef<Element | null>(null)

  const landing =
    held === null || canvas.current === null
      ? null
      : itemLandingAt(held, canvas.current, scaleFor({ pxPerDay, gutter }))

  const start = (event: PointerEvent<HTMLDivElement>): boolean => {
    const svg = enabled ? (frame.current?.querySelector(CANVAS) ?? null) : null
    const begun = svg === null ? null : itemHeldFrom(event.target, svg)
    if (begun === null) return false
    canvas.current = svg
    setHeld(begun)
    return true
  }

  const finish = (): void => {
    setHeld(null)
    if (held === null || landing === null || itemUnmoved(held, landing)) return
    onMoved(held.itemId, landing, { featureId: held.featureId, position: held.position })
  }

  return {
    cancel: () => setHeld(null),
    finish,
    held,
    landing,
    move: (travelled) => setHeld((was) => (was === null ? was : { ...was, travelled })),
    start,
  }
}
