import { scaleFor, type PlanScale } from '@repo/canvas'
import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { beforeOn, boardIn, markFrom, onHandle, pointerAt, type Hovered } from './extend-dom'
import { aimOf, draftOf, type DrawAim, type DrawnAt, type DrawnSide } from './extend-view'
import { writeDraw, type ExtendWrites } from './extend-write'

const CANVAS = '[data-slot="plan-canvas"]'

interface Drawing {
  readonly from: Hovered
  readonly side: DrawnSide
  readonly at: DrawnAt
}

/** How big the canvas is, read off its own attributes rather than measured. */
export interface DrawBox {
  /** Its width in px. */
  readonly width: number

  /** Its height in px. */
  readonly height: number
}

/** What a draw needs to know about the plan it is happening on. */
export interface ExtendQuery {
  /** The plan every write is addressed at. */
  readonly planId: string

  /** How many px a day is. */
  readonly pxPerDay: number

  /** The gutter before day zero. */
  readonly gutter: number

  /** How many working days a sprint holds, for the chip and for a cross-rail pin. */
  readonly sprintLengthDays: number

  /** The actions a release spends, each `null` where this surface may not make it. */
  readonly writes: ExtendWrites
}

/** Everything the draw root binds to its own element. */
export interface ExtendState {
  /** The root element, which the canvas is inside and the pointer is captured on. */
  readonly frame: React.RefObject<HTMLDivElement | null>

  /** The mark the handles are drawn over, or `null` for a pointer on none. */
  readonly hovered: Hovered | null

  /** What the pointer has drawn, or `null` while nothing is being drawn. */
  readonly aim: DrawAim | null

  /** Which edge is the free one, for the guide. */
  readonly forward: boolean

  /** The end the draw started from, drawn as a connector once it crosses into another lane. */
  readonly from: { readonly x: number; readonly y: number } | null

  /** How big the sheet over the canvas should be. */
  readonly box: DrawBox

  /** What a day is worth in px, for the ghost. */
  readonly scale: PlanScale

  /** Follow the pointer from mark to mark, which is what decides where the handles are. */
  readonly over: (event: PointerEvent<HTMLDivElement>) => void

  /** Begin a draw from one end of the hovered mark. */
  readonly begin: (side: DrawnSide, event: PointerEvent<SVGGElement>) => void

  /** Follow the pointer while drawing. */
  readonly move: (event: PointerEvent<HTMLDivElement>) => void

  /** Create what was drawn. */
  readonly finish: (event: PointerEvent<HTMLDivElement>) => void

  /** Abandon the draw, creating nothing. */
  readonly cancel: () => void
}

const boxOf = (frame: Element | null): DrawBox => {
  const canvas = frame?.querySelector(CANVAS) ?? null
  return {
    height: Number(canvas?.getAttribute('height') ?? 0),
    width: Number(canvas?.getAttribute('width') ?? 0),
  }
}

const startedFrom = (
  drawing: Drawing | null,
  sprintLengthDays: number,
): { readonly x: number; readonly y: number } | null => {
  if (drawing === null) return null
  const aim = aimOf(drawnOf(drawing), drawing.at, sprintLengthDays)
  if (aim.sameLane) return null
  const { from, side } = drawing
  return { x: side === 'end' ? from.x + from.width : from.x, y: from.y }
}

const drawnOf = (drawing: Drawing) => ({
  epicId: drawing.from.epicId,
  featureId: drawing.from.featureId,
  kind: drawing.from.kind,
  labelId: drawing.from.labelId,
  name: drawing.from.name,
  originDay: drawing.side === 'end' ? drawing.from.endDay : drawing.from.startDay,
  position: drawing.from.position,
  side: drawing.side,
  subjectId: drawing.from.subjectId,
})

/**
 * The whole gesture: which mark the handles are on, where a drag has got to, and what a release makes.
 *
 * ### Why hover is state and not CSS
 *
 * The handles are drawn over the mark under the pointer rather than with every mark, so which mark that is
 * has to be known in JavaScript. It costs one re-render of a two-node overlay as the pointer crosses marks,
 * and it saves four thousand nodes at the two-thousand-item cap (`./extend-handle.tsx`).
 *
 * A pointer that moves **onto a handle** must not clear it, which is the one special case: the handles are
 * over the mark's edge, not inside the mark, so entering one would otherwise read as leaving the mark and
 * take the handle out from under the pointer.
 *
 * ### Why the draw state is one object
 *
 * A half-updated draw is a bar drawn from one gesture to another's pointer. Every move replaces the whole
 * of it, and the only thing held across a render is which handle the drag started on — the rails, the
 * scale and the canvas box are read back fresh from the DOM, so a board that revalidated mid-drag is
 * measured as it is now (`./extend-dom.ts`).
 *
 * The pointer is **captured** on the root, so a drag that leaves the canvas — over the panel, outside the
 * window — still ends in a release here rather than in a bar that follows the pointer forever.
 *
 * @param query - The plan, the scale and the writes.
 * @returns The ref, what is hovered, what is drawn, and the handlers the root binds.
 */
export function useExtend(query: ExtendQuery): ExtendState {
  const { planId, pxPerDay, gutter, sprintLengthDays, writes } = query
  const frame = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const scale = scaleFor({ pxPerDay, gutter })

  const over = (event: PointerEvent<HTMLDivElement>): void => {
    if (drawing !== null || onHandle(event.target)) return
    setHovered(markFrom(event.target))
  }

  const begin = (side: DrawnSide, event: PointerEvent<SVGGElement>): void => {
    const board = boardIn(frame.current, scale)
    if (hovered === null || board === null) return
    event.stopPropagation()
    event.preventDefault()
    frame.current?.setPointerCapture(event.pointerId)
    setDrawing({ at: pointerAt(board, event), from: hovered, side })
  }

  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const board = boardIn(frame.current, scale)
    if (drawing === null || board === null) return
    setDrawing({ ...drawing, at: pointerAt(board, event) })
  }

  const finish = (event: PointerEvent<HTMLDivElement>): void => {
    const board = boardIn(frame.current, scale)
    setDrawing(null)
    if (drawing === null || board === null) return
    const drawn = drawnOf(drawing)
    const aim = aimOf(drawn, drawing.at, sprintLengthDays)
    const at = pointerAt(board, event)
    const where = { ...at, before: beforeOn(board.rails, at.lane, aim.fromDay) }
    const draft = draftOf(drawn, aim, where, sprintLengthDays)
    if (draft !== null) void writeDraw({ ...draft, planId }, writes)
  }

  return {
    aim: drawing === null ? null : aimOf(drawnOf(drawing), drawing.at, sprintLengthDays),
    begin,
    box: boxOf(frame.current),
    cancel: () => setDrawing(null),
    finish,
    forward: drawing?.side === 'end',
    from: startedFrom(drawing, sprintLengthDays),
    frame,
    hovered: drawing === null ? hovered : null,
    move,
    over,
    scale,
  }
}
