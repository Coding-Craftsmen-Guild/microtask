'use client'

import type { ReactNode } from 'react'
import { DRAW } from './extend-css'
import { ExtendGhost } from './extend-ghost'
import { ExtendOverlay } from './extend-overlay'
import type { ExtendWrites } from './extend-write'
import { useExtend } from './use-extend'

/** Props for {@link ExtendRoot}. */
export interface ExtendRootProps {
  /** The server-rendered board, which this island only listens over. */
  readonly children: ReactNode

  /** The plan every write is addressed at. */
  readonly planId: string

  /** How many px a day is, for turning an x back into a day. */
  readonly pxPerDay: number

  /** The gutter before day zero. */
  readonly gutter: number

  /** How many working days a sprint holds, for the chip and for a cross-rail pin. */
  readonly sprintLengthDays: number

  /** Add a feature to a rail, or `null` where this surface may not. */
  readonly createFeature: ExtendWrites['createFeature']

  /** Add an item to a feature. */
  readonly createItem: ExtendWrites['createItem']

  /** Order a feature on its rail. */
  readonly placeFeature: ExtendWrites['placeFeature']

  /** Order an item in its feature. */
  readonly placeItem: ExtendWrites['placeItem']

  /** Replace a feature's dependencies. */
  readonly setDependencies: ExtendWrites['setDependencies']

  /** Put a feature in a group. */
  readonly labelFeature: ExtendWrites['labelFeature']
}

/**
 * Draw the work that comes next: grab the `+` on either end of a mark and pull.
 *
 * ### One island over two thousand nodes
 *
 * The same shape as `./drag-root.tsx` and for the same reason: the canvas is a Server Component of two
 * thousand marks, so what listens is one client element wrapping it, and what it needs it reads off the
 * DOM (`./extend-dom.ts`). Nothing about a handle crosses a boundary as data — the ids, the names and the
 * days are attributes on the element the pointer landed on, which is why the six writes arrive flat here
 * rather than as a record (`../module-boundaries.test.tsx`).
 *
 * It is nested **inside** `DragRoot`, and the `stopPropagation` in `./use-extend.ts` is what keeps the two
 * apart: a pointer down on a handle would otherwise also start dragging the bar the handle sits on, since
 * the handle is inside that bar's own rail. Each gesture has exactly one meaning.
 *
 * ### What a release writes
 *
 * `./extend-view.ts` turns the gesture into a draft — an item in this feature, or a feature on that rail,
 * with a dependency one way or the other — and `./extend-write.ts` spends it on existing actions. Nothing
 * here is a new route: drawing is a second way to say what the panel's own fields already say.
 */
export function ExtendRoot(props: ExtendRootProps) {
  const { children, planId, pxPerDay, gutter, sprintLengthDays } = props
  const draw = useExtend({
    gutter,
    planId,
    pxPerDay,
    sprintLengthDays,
    writes: {
      createFeature: props.createFeature,
      createItem: props.createItem,
      labelFeature: props.labelFeature,
      placeFeature: props.placeFeature,
      placeItem: props.placeItem,
      setDependencies: props.setDependencies,
    },
  })
  return (
    <div
      className={DRAW.root}
      data-drawing={draw.aim === null ? undefined : ''}
      data-slot="extend-root"
      onPointerCancel={draw.cancel}
      onPointerLeave={draw.cancel}
      onPointerMove={draw.move}
      onPointerOver={draw.over}
      onPointerUp={draw.finish}
      ref={draw.frame}
    >
      {children}
      <ExtendOverlay box={draw.box} hovered={draw.hovered} onBegin={draw.begin} />
      {draw.aim === null ? null : (
        <ExtendGhost
          aim={draw.aim}
          box={draw.box}
          forward={draw.forward}
          from={draw.from}
          scale={draw.scale}
        />
      )}
    </div>
  )
}
