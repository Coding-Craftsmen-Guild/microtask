'use client'

import { scaleFor } from '@repo/canvas'
import { useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { DROP_MARK } from './create-css'
import { aimedAt, type Aim } from './create-aim'
import { kindOfTypes } from './create-kinds'
import { writeDrop, type CreateWrites } from './create-write'
import { DropMark } from './drop-mark'

const CANVAS = '[data-slot="plan-canvas"]'

/** Props for {@link CreateRoot}. */
export interface CreateRootProps {
  /** The board, server-rendered, handed through untouched. */
  readonly children: ReactNode

  /** The plan every write is addressed at. */
  readonly planId: string

  /** The scale's px per working day, the same number the canvas was drawn at. */
  readonly pxPerDay: number

  /** The scale's left inset, which with `pxPerDay` is the whole of a `PlanScale`. */
  readonly gutter: number

  /** The plan's own sprint length, which turns a dropped day into a pin. */
  readonly sprintLengthDays: number

  /** The hue to propose for a dropped rail, chosen on the server from how many there already are. */
  readonly nextRailColour: string

  /**
   * The four writes a drop can make, **flat**, each `null` where this viewer may not make it.
   *
   * Four props and not one `CreateWrites`, because this is the boundary: every prop of a client
   * component is serialised into the Flight payload, and `../module-boundaries.test.tsx` admits
   * primitives, unbound functions and markup on `children` — an object of any kind is refused there by
   * shape, which is the check that would have caught a plan or a seat list riding in beside them.
   * `ShareManager` is flat for the same reason and says so. They are regrouped into one record on this
   * side of the line, where the record is a local value rather than a thing that crossed.
   */
  readonly createEpic: CreateWrites['createEpic']

  /** Moves a dropped rail to the gap the line was drawn at; see `./create-write.ts`. */
  readonly reorderEpic: CreateWrites['reorderEpic']

  /** Adds a feature to the rail a pill was dropped on. */
  readonly createFeature: CreateWrites['createFeature']

  /** Adds an item to the feature a pill was dropped inside. */
  readonly createItem: CreateWrites['createItem']
}

/**
 * The board, and what happens when one of the strip's pills is let go of over it.
 *
 * ### What it measures, and why it has to
 *
 * One rectangle: the canvas's own, read on `dragover`. `DragRoot` inside it measures nothing at all
 * and says why — a drag it starts has an **anchor**, so every position is `anchor + delta`. A drop
 * from outside the board has no anchor; the only thing the platform offers is a client point, and
 * turning that into a working day needs to know where the canvas's left edge is.
 *
 * So ADR 0055's warning applies in full: `happy-dom` answers `getBoundingClientRect` with a zero
 * `DOMRect`, so no test here can tell a correct conversion from one off by the board's own offset.
 * `./create-drop.ts` holds every decision that *can* be checked — which lane, which gap, which
 * feature, which sprint — as functions over numbers, and what is left here is the subtraction.
 * **This is the browser-verification item this change hands forward:** drag each pill onto the board
 * and check the preview lands under the pointer rather than offset from it.
 *
 * ### Why `dragover` must cancel
 *
 * A target that does not `preventDefault` its `dragover` is not a drop target: the platform's default
 * is to refuse, and refusing is silent. That one line is the difference between pills that can be
 * picked up and pills that can be let go of. It is called only for a drag this board knows — a file
 * dragged in from the desktop is left to the browser rather than swallowed.
 *
 * ### Why the kind is in the `dataTransfer` **type**
 *
 * A drag's payload is withheld until the drop, so `dragover` can read only what it is offered under.
 * `./create-kinds.ts` carries why that makes the kind a MIME type: the preview has to know a whole
 * gesture before the drop does.
 */
export function CreateRoot(props: CreateRootProps) {
  const { children, planId, pxPerDay, gutter, sprintLengthDays, nextRailColour } = props
  const frame = useRef<HTMLDivElement>(null)
  const [aim, setAim] = useState<Aim | null>(null)
  const writes: CreateWrites = {
    createEpic: props.createEpic,
    reorderEpic: props.reorderEpic,
    createFeature: props.createFeature,
    createItem: props.createItem,
  }

  const aimFor = (event: DragEvent<HTMLDivElement>): Aim | null => {
    const kind = kindOfTypes([...event.dataTransfer.types])
    const canvas = frame.current?.querySelector(CANVAS) ?? null
    if (kind === null || canvas === null) return null
    const box = canvas.getBoundingClientRect()
    const point = { x: event.clientX - box.left, y: event.clientY - box.top }
    return aimedAt(kind, point, canvas, { scale: scaleFor({ pxPerDay, gutter }), sprintLengthDays })
  }

  const over = (event: DragEvent<HTMLDivElement>): void => {
    const next = aimFor(event)
    if (next === null) return
    event.preventDefault()
    setAim(next)
  }

  const land = (event: DragEvent<HTMLDivElement>): void => {
    const landed = aimFor(event)
    setAim(null)
    if (landed === null) return
    event.preventDefault()
    if (!landed.refused) void writeDrop(landed.target, { planId, writes, colour: nextRailColour })
  }

  return (
    <div
      className={DROP_MARK.root}
      data-slot="create-root"
      onDragLeave={() => setAim(null)}
      onDragOver={over}
      onDrop={land}
      ref={frame}
    >
      {children}
      <DropMark aim={aim} />
    </div>
  )
}
