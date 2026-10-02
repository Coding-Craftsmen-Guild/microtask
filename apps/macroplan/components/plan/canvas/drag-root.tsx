'use client'

import { useRef } from 'react'
import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { DragGhost } from './drag-ghost'
import { DragNotice } from './drag-notice'
import type { FeaturePlace, ItemPlace } from './drag-places'

export type { FeaturePlace, ItemPlace } from './drag-places'
import { ItemGhost } from './item-ghost'
import { originAt, travelledBy, type Origin } from './selection'
import { useDragWrites } from './use-drag-writes'
import { useFeatureDrag } from './use-feature-drag'
import { useItemDrag } from './use-item-drag'

const FRAME = 'relative w-full min-w-fit'

const A_CLICK = 4

/** Props for {@link DragRoot}. */
export interface DragRootProps {
  /**
   * The server-rendered `<svg>` this listens over, handed through untouched.
   *
   * The one prop crossing this boundary that is not a primitive, and the only one there is a stated
   * exception for: `../module-boundaries.test.tsx` admits **markup** on `children` and refuses a plan, a
   * row, a token, or an element on any other prop. It is markup rather than data — no bar becomes a client
   * component, no per-bar prop enters the Flight payload, and nothing under here re-renders during a drag.
   */
  readonly children: ReactNode

  /** The plan a placement is addressed at. */
  readonly planId: string

  /** The x of the canvas's first day: everything left of it is the label gutter. */
  readonly axisX: number

  /** The scale's left inset, which with `pxPerDay` is the whole of a `PlanScale`. */
  readonly gutter: number

  /** The scale's px per working day. */
  readonly pxPerDay: number

  /** The placement write, or `null` on a surface that may not move a bar and so listens for nothing. */
  readonly place: FeaturePlace | null

  /**
   * The item placement write, or `null` on a surface that may not move one.
   *
   * Separate from {@link DragRootProps.place} because they are separate permissions and separate
   * gestures: a seat that may reorder a rail's features is not thereby allowed to reparent their items,
   * and a surface handed one and not the other listens for exactly the one it has.
   */
  readonly placeItem: ItemPlace | null
}

/**
 * The one client component on the canvas: it listens for a drag over the server-rendered SVG it wraps.
 *
 * ### Why the frame is `w-full min-w-fit`
 *
 * It was `w-fit`, and that is what kept the canvas from reaching the right edge of a wide pane — a fault
 * that read as the grid giving up partway across the page. `fit-content` shrinks to the SVG's own
 * `minWidth`, so a 1040px canvas in a 1412px pane got a 1040px frame, and the SVG's `w-full` then
 * resolved against the frame rather than against the pane. Everything inside was drawn correctly and
 * clipped at 1040.
 *
 * So the frame says what the SVG and `../board/time-header.tsx` both say: fill the pane, and never be
 * narrower than the plan's own days. `min-w-fit` is the second half and is not optional — without it a
 * plan too long for the pane would be squashed rather than scrolled.
 *
 * It changes nothing about the drag. This is the ghost's containing block and the frame only ever grows
 * **rightwards**: its left edge is still the canvas's left edge, which is the only part of it the
 * geometry reads.
 *
 * ### One delegation root, and no client component per bar
 *
 * The canvas stays a Server Component — 2,000-odd nodes of it — and this wraps it. Every bar and stub
 * already carries `data-feature-id` and `data-slot` from phase 2, so what was grabbed is `closest()` on the
 * event's target and never a hit test (`./selection.ts`). The three alternatives are each refused: a client
 * canvas re-renders the whole SVG in the browser, a client component per bar puts 200 islands and their
 * props in the Flight payload, and a **transparent sheet** over the bars is the one phase 2 closed by name
 * — `./feature-bar.tsx` says a sheet "would swallow the drag and the click it adds", which is why the
 * listener is on the element *around* the canvas and the ghost is `pointer-events-none`.
 *
 * ### The layout comes out of the markup, because it may not come across as a prop
 *
 * A client component may be handed primitives, an unbound function or `null` — and, by the narrow exception
 * this file is the reason for, markup on `children`. So the rails `dropTargetFor` needs are read back off
 * the SVG at `pointerdown`, and the plan they were derived from never reaches the browser at all (ADR
 * 0033). `./selection.ts` argues that in full, and it is not only a boundary workaround: a drop is then
 * answered against what is on screen rather than against a second copy of the layout.
 *
 * What does cross as numbers is the scale's two fields and the axis's x. They are the same values the SVG
 * was drawn from, threaded down by `./plan-canvas.tsx` out of one `canvasLayout` call, so `scaleFor` below
 * rebuilds the scale that drew the bars rather than a second opinion about it. `LAYOUT` is **imported**
 * rather than passed, which is what `RailMetrics` asks for: "hand over the record that is rendered from,
 * rather than a fresh literal at the call site".
 *
 * ### There is no longer a line no test can check
 *
 * There was one: `canvas.getBoundingClientRect().width`, read in `start` to convert a client-pixel
 * delta into the user units a `viewBox` defines. ADR 0055 records why no test here could cover it —
 * `happy-dom` answers every `getBoundingClientRect` with a zero `DOMRect` and every `getCTM` with an
 * identity matrix, so a measurement is a number a test is handed as 0 and can only assert against 0.
 *
 * The canvas carries no `viewBox` now (`./plan-canvas.tsx` argues it), so it has no scaling transform
 * and a client pixel **is** a user unit however wide the pane is. The conversion is gone rather than
 * stubbed, this component measures nothing at all, and every position here is `anchor + delta`.
 *
 * **This is the browser-verification item this task hands forward:** open a plan, drag a bar, and check
 * that the ghost tracks the pointer at 1:1 and that the bar lands where the ghost was. A wrong factor is
 * invisible to every test here and obvious in one gesture.
 *
 * ### What is sent, and what is not
 *
 * `settledAt` answers two placements — where the drop landed, and where the dragged feature already is —
 * and both come from the same `dropTargetFor` call with only the travel differing. Nothing is sent when
 * they agree (`unchanged`), which is the no-op half of §9's "a test asserts nothing auto-moves": a drop back
 * on a bar's own x is not a write. Nothing is sent when the drop names no placement either, and nothing is
 * clamped to the nearest rail — §6: "there is no packing algorithm and nothing is ever auto-moved."
 *
 * One request, for one feature. Every other feature's rail, place, pin and estimate is untouched because no
 * other request exists to touch them: the API renumbers the rail it was asked about and answers the whole
 * recomputed plan, and nothing here writes locally, so what is on screen after a drop is what the server
 * stored. `./drag-root.test.tsx` asserts that as a property over every bar and every drop x of a fixture.
 *
 * ### Undo is a compensating placement, one step deep
 *
 * The `(epicId, position)` the feature held before the drop is `settled.back`, read out of the layout the
 * drop was answered against, and an undo is the same `place` call carrying it. One step, replaced by the
 * next drop, and not a history: a stack would need every write to be invertible and a delete is not
 * (`../drawer/delete-control.tsx` keeps a confirm dialog for that reason). `./drag-notice.tsx` is where it
 * is offered, and an undo carries no `back` of its own, which is what makes it one step rather than a
 * toggle.
 *
 * ### What a keyboard gets instead
 *
 * Not this. A control that exists only under a pointer is a control a keyboard user does not have, and
 * `happy-dom` cannot drive a real drag — so the reorder a reader uses is the drawer's `Move up` / `Move
 * down` and its rail control, over the same `place` action (`../drawer/place-controls.tsx`). The ghost is
 * `aria-hidden` for the same reason, and ADR 0056 records why there is no a11y tooling here to check either
 * half.
 *
 * `data-drag` states whether this frame listens at all, which is the one thing about a pointer affordance
 * that a test can read: the handlers are invisible in the markup, and a canvas whose drag was silently
 * wired to nothing would render identically to one that works. `PlanScreen` is what decides it, out of
 * `controls.placeFeature` and whether it was handed the writes at all.
 *
 * A pointer that leaves the frame cancels, and that is the same answer as a drop on the chrome: the drag is
 * forgotten and nothing is sent. Nothing is captured with `setPointerCapture`, so a drag continued outside
 * the frame is one that ended at the edge — which is honest about what was last seen rather than
 * extrapolating a position from a pointer the canvas stopped hearing from.
 */
export function DragRoot(props: DragRootProps) {
  const { children, planId, axisX, gutter, pxPerDay, place, placeItem } = props
  const frame = useRef<HTMLDivElement>(null)
  const origin = useRef<Origin | null>(null)
  const dragged = useRef(false)
  const writes = useDragWrites({ place, placeItem, planId })
  const item = useItemDrag({ enabled: placeItem !== null, frame, gutter, onMoved: writes.moveItem, pxPerDay })
  const bar = useFeatureDrag({ axisX, enabled: place !== null, frame, gutter, onMoved: writes.moveFeature, pxPerDay })
  const start = (event: PointerEvent<HTMLDivElement>) => {
    origin.current = originAt({ x: event.clientX, y: event.clientY })
    dragged.current = false
    if (!item.start(event)) bar.start(event)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const from = origin.current
    const at = { x: event.clientX, y: event.clientY }
    if (from === null) return
    if (Math.abs(at.x - from.x) + Math.abs(at.y - from.y) > A_CLICK) dragged.current = true
    const travelled = travelledBy(from, at)
    item.move(travelled)
    bar.move(travelled)
  }
  const swallowAfterDrag = (event: MouseEvent<HTMLDivElement>) => {
    if (!dragged.current) return
    event.preventDefault()
    event.stopPropagation()
    dragged.current = false
  }
  const away = () => {
    bar.cancel()
    item.cancel()
  }
  const finish = () => {
    item.finish()
    bar.finish()
  }
  return (
    <div className={FRAME} data-drag={place !== null} data-item-drag={placeItem !== null} data-slot="drag-root" onClickCapture={swallowAfterDrag} onPointerDown={start} onPointerLeave={away} onPointerMove={move} onPointerUp={finish} ref={frame}>
      {children}
      {bar.held === null || bar.settled === null ? null : <DragGhost held={bar.held} refused={bar.settled.to === null} />}
      {item.held === null ? null : <ItemGhost box={item.held.box} held={item.held} refused={item.landing === null} />}
      <DragNotice said={writes.said} undo={writes.undo} />
    </div>
  )
}
