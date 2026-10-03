'use client'

import type { ReactNode } from 'react'
import { DROP_MARK } from './create-css'
import type { CreateWrites } from './create-write'
import { DropMark } from './drop-mark'
import { useDrop } from './use-drop'

/** Props for {@link CreateRoot}. */
export interface CreateRootProps {
  /** The board, which this only listens over. */
  readonly children: ReactNode

  /** The plan every write is addressed at. */
  readonly planId: string

  /** What a day is worth in px. */
  readonly pxPerDay: number

  /** The gutter before day zero. */
  readonly gutter: number

  /** The plan's first working day. */
  readonly startDate: string

  /** How many working days a sprint holds. */
  readonly sprintLengthDays: number

  /** The zone the dates are read in. */
  readonly timezone: string

  /** The hue a dropped rail would take. */
  readonly nextRailColour: string

  /** Put drawn or dropped work on the plan, as one change (`../store/gestures.ts`); `null` where none may be added. */
  readonly draw: CreateWrites['draw']

  /** Add a rail where it was dropped, as one change; `null` where a rail may not be added. */
  readonly dropRail: CreateWrites['dropRail']

  /** Move a rail that was dragged by its grip. */
  readonly reorderEpic: CreateWrites['reorderEpic']
}

/**
 * The board as a drop target: the preview while a drag is over it, and the write when it lands.
 *
 * ### Why the whole board and not each rail
 *
 * A drop is answered in the board's own coordinates — which lane, which day, which gap between two rails —
 * so one listener over the canvas is the shape that question has. Per-rail targets would each have to know
 * where they are, and a drag between two of them would land on neither.
 *
 * ### Why a rail being dragged is handled here too
 *
 * `dragstart` bubbles, so a rail row needs no JavaScript of its own: the row carries `draggable` and this
 * root sets the drag type and remembers which rail it was. That keeps the rail column a Server Component —
 * forty rows, no islands — and it is why the id travels in a ref rather than in the drag's data, which the
 * browser refuses to hand over until the drop (`./create-kinds.ts`).
 */
export function CreateRoot(props: CreateRootProps) {
  const { children, planId, pxPerDay, gutter, nextRailColour } = props
  const drop = useDrop({
    calendar: {
      sprintLengthDays: props.sprintLengthDays,
      startDate: props.startDate,
      timezone: props.timezone,
    },
    colour: nextRailColour,
    gutter,
    planId,
    pxPerDay,
    writes: {
      draw: props.draw,
      dropRail: props.dropRail,
      reorderEpic: props.reorderEpic,
    },
  })
  return (
    <div
      className={DROP_MARK.root}
      data-slot="create-root"
      onDragLeave={drop.leave}
      onDragOver={drop.over}
      onDragStart={drop.grab}
      onDrop={drop.land}
      ref={drop.frame}
    >
      {children}
      <DropMark aim={drop.aim} />
    </div>
  )
}
