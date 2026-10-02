'use client'

import type { ReactNode } from 'react'
import { DROP_MARK } from './create-css'
import type { CreateWrites } from './create-write'
import { DropMark } from './drop-mark'
import { useDrop } from './use-drop'

/** Props for {@link CreateRoot}. */
export interface CreateRootProps {
  /** The board, which is server-rendered and only listened over. */
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

  /** Add a rail. */
  readonly createEpic: CreateWrites['createEpic']

  /** Move a rail, which is both what a dropped new rail needs and what a dragged one is. */
  readonly reorderEpic: CreateWrites['reorderEpic']

  /** Add a feature. */
  readonly createFeature: CreateWrites['createFeature']

  /** Add an item. */
  readonly createItem: CreateWrites['createItem']

  /** Order a feature on its rail. */
  readonly placeFeature: CreateWrites['placeFeature']

  /** Order an item in its feature. */
  readonly placeItem: CreateWrites['placeItem']

  /** Set a feature's dependencies, for work dropped after another feature. */
  readonly setDependencies: CreateWrites['setDependencies']

  /** Put a feature in a group, so work dropped after another joins its group. */
  readonly labelFeature: CreateWrites['labelFeature']
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
      createEpic: props.createEpic,
      createFeature: props.createFeature,
      createItem: props.createItem,
      labelFeature: props.labelFeature,
      placeFeature: props.placeFeature,
      placeItem: props.placeItem,
      reorderEpic: props.reorderEpic,
      setDependencies: props.setDependencies,
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
