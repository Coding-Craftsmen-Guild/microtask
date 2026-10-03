import { scaleFor } from '@repo/canvas'
import type { PlanCalendar } from '@repo/schedule'
import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { aimedAt, type Aim } from './create-aim'
import { railPathOf } from './rail-route'
import { dragTypeOf, kindOfTypes } from './create-kinds'
import { writeDrop, type CreateWrites } from './create-write'
import { usePlanNav } from '../nav/plan-nav'

const CANVAS = '[data-slot="plan-canvas"]'

const ROW = '[data-slot="rail-row"]'

/** What a drop over the board is measured against and written with. */
export interface DropQuery {
  /** The plan every write is addressed at. */
  readonly planId: string

  /** What a day is worth in px. */
  readonly pxPerDay: number

  /** The gutter before day zero. */
  readonly gutter: number

  /** The plan's calendar, for the sprint a drop pins to and the date its chip says. */
  readonly calendar: PlanCalendar

  /** The hue a new rail would take. */
  readonly colour: string

  /** The actions, each `null` where this surface may not make it. */
  readonly writes: CreateWrites
}

/** Everything the drop root binds to its own element. */
export interface DropState {
  /** The root, which the canvas is somewhere inside. */
  readonly frame: React.RefObject<HTMLDivElement | null>

  /** What the drag over the board is pointing at, or `null` while nothing is over it. */
  readonly aim: Aim | null

  /** Remember which rail a drag started from, and tell the browser what kind of drag it is. */
  readonly grab: (event: DragEvent<HTMLDivElement>) => void

  /** Preview where the drag would land. */
  readonly over: (event: DragEvent<HTMLDivElement>) => void

  /** Write what it landed on. */
  readonly land: (event: DragEvent<HTMLDivElement>) => void

  /** Stop previewing, the drag having left the board. */
  readonly leave: () => void
}

/**
 * The board's drop target: one preview, four gestures, and the writes they end in.
 *
 * ### Why a rail being dragged is handled here
 *
 * `dragstart` bubbles, so a rail row needs no JavaScript of its own: the row carries `draggable` and this
 * sets the drag's type from whatever row the event came from. That keeps the rail column a Server Component
 * with forty rows in it and no islands.
 *
 * The id goes in a **ref** rather than in the drag's data because `dataTransfer.getData` is unreadable
 * until the drop, and the preview needs to know which rail is moving before then. It cannot ride in the
 * type either: a type is lowercased by the browser and a ULID is not (`./create-kinds.ts`).
 *
 * @param query - The plan, the scale, the calendar and the writes.
 * @returns The ref, the preview and the four handlers.
 */
export function useDrop(query: DropQuery): DropState {
  const { planId, pxPerDay, gutter, calendar, colour, writes } = query
  const { go } = usePlanNav()
  const frame = useRef<HTMLDivElement>(null)
  const dragged = useRef('')
  const [aim, setAim] = useState<Aim | null>(null)

  const grab = (event: DragEvent<HTMLDivElement>): void => {
    const row = event.target instanceof Element ? event.target.closest(ROW) : null
    const epicId = row?.getAttribute('data-epic-id') ?? ''
    if (epicId === '') return
    dragged.current = epicId
    event.dataTransfer.setData(dragTypeOf('rail'), epicId)
    event.dataTransfer.effectAllowed = 'move'
  }

  const aimFor = (event: DragEvent<HTMLDivElement>): Aim | null => {
    const kind = kindOfTypes([...event.dataTransfer.types])
    const canvas = frame.current?.querySelector(CANVAS) ?? null
    if (kind === null || canvas === null) return null
    const box = canvas.getBoundingClientRect()
    const point = { x: event.clientX - box.left, y: event.clientY - box.top }
    return aimedAt(kind, point, canvas, {
      calendar,
      railId: dragged.current,
      scale: scaleFor({ pxPerDay, gutter }),
    })
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
    if (landed.refused) return
    void writeDrop(landed.target, { colour, planId, writes }).then((made) => {
      if (made !== null) go(railPathOf(window.location.pathname, made))
    })
  }

  return { aim, frame, grab, land, leave: () => setAim(null), over }
}
