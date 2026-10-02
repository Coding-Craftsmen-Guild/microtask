import { scaleFor, type DropTarget } from '@repo/canvas'
import { useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import { heldFrom, settledAt, unchanged, type Held, type Settled } from './selection'

const CANVAS = '[data-slot="plan-canvas"]'

/** What the feature drag needs: where to look, the axis it was drawn on, and where to send a drop. */
export interface FeatureDragQuery {
  readonly frame: RefObject<HTMLDivElement | null>

  readonly axisX: number

  readonly pxPerDay: number

  readonly gutter: number

  /** Whether this surface may move a bar at all; `false` listens for nothing. */
  readonly enabled: boolean

  /** Send one landed drop: the feature, where it goes, and where it came from. */
  readonly onMoved: (featureId: string, to: DropTarget, back: DropTarget | null) => void
}

/** Everything the drag root spends to let a feature be moved. */
export interface FeatureDragState {
  /** The bar being dragged, or `null` while none is. */
  readonly held: Held | null

  /** Where it would land and where it already is, or `null` while nothing is dragged. */
  readonly settled: Settled | null

  /** Take the `pointerdown` if it was on a bar; `false` leaves it to whatever else is listening. */
  readonly start: (event: PointerEvent<HTMLDivElement>) => boolean

  readonly move: (travelled: { readonly x: number; readonly y: number }) => void

  readonly finish: () => void

  readonly cancel: () => void
}

/**
 * Moving a feature to another rail, or to another place on its own, by dragging its mark.
 *
 * The gesture `./drag-root.tsx` has always had, lifted out of it when a **second** drag joined it
 * (`./use-item-drag.ts`): two state machines in one component put that component past the size this
 * repo holds a component to, and the half that had to move is the one with a sibling to be symmetrical
 * with. Nothing about what it does changed — `./selection.ts` still answers every placement, against
 * the markup and never against a prop.
 *
 * What stayed in the root is what the two share: the pointer, the origin they both measure travel from,
 * and the one line underneath that says what either of them did.
 *
 * @param query - Where to look, the axis, and the write.
 * @returns The drag, the two placements, and the four handlers.
 */
export function useFeatureDrag(query: FeatureDragQuery): FeatureDragState {
  const { frame, axisX, pxPerDay, gutter, enabled, onMoved } = query
  const [held, setHeld] = useState<Held | null>(null)
  const canvas = useRef<Element | null>(null)
  const settled: Settled | null =
    held === null ? null : settledAt(held, scaleFor({ pxPerDay, gutter }), axisX)

  const start = (event: PointerEvent<HTMLDivElement>): boolean => {
    const svg = enabled ? (frame.current?.querySelector(CANVAS) ?? null) : null
    const begun = svg === null ? null : heldFrom(event.target, svg)
    if (begun === null) return false
    canvas.current = svg
    setHeld(begun)
    return true
  }

  const finish = (): void => {
    setHeld(null)
    if (held === null || settled === null || settled.to === null || unchanged(settled)) return
    onMoved(held.grabbed.featureId, settled.to, settled.back)
  }

  return {
    cancel: () => setHeld(null),
    finish,
    held,
    move: (travelled) => setHeld((was) => (was === null ? was : { ...was, travelled })),
    settled,
    start,
  }
}
