'use client'

import type { FeaturePlacement, Plan } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import { scaleFor } from '@repo/canvas'
import type { DropTarget } from '@repo/canvas'
import { useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import type { ActionResult } from '../../../actions/result'
import { DragGhost } from './drag-ghost'
import { DragNotice, MOVED, type Said } from './drag-notice'
import { heldFrom, originAt, settledAt, travelledBy, unchanged, type Held, type Origin, type Settled } from './selection'

const FRAME = 'relative w-fit'

const CANVAS = '[data-slot="plan-canvas"]'

/**
 * One feature moved: the plan, the feature, and the rail and place it lands at.
 *
 * `PlanEditActions['placeFeature']` is assignable to it, so this boundary takes that one member as a prop
 * and cannot reach the other seventeen — the rule `../drawer/field.ts` states for `SubjectWrite`, and the
 * reason a surface's writes are a prop rather than an import (`../edit-actions.ts`). `FeaturePlacement` and
 * `Plan` arrive through `import type`, which is erased, so no client module here imports
 * `@repo/api-client` for a value.
 */
export type FeaturePlace = (
  planId: string,
  featureId: string,
  to: FeaturePlacement,
) => Promise<ActionResult<Plan>>

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
}

/**
 * The one client component on the canvas: it listens for a drag over the server-rendered SVG it wraps.
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
 * ### The one line no test in this repository can check
 *
 * `canvas.getBoundingClientRect().width`, in `start` below. `happy-dom` answers every
 * `getBoundingClientRect` with a zero `DOMRect` and every `getCTM` with an identity matrix, so a
 * measurement is a number a test is handed as 0 and can only assert against 0 (ADR 0055). It is one line,
 * it is the **only** measurement in this component, and `originAt` is the arithmetic around it — a pure
 * function of two numbers, tested directly, answering a factor of 1 for the zero this measurement has under
 * test. Everything else here is `anchor + delta`, which needs no CTM.
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
export function DragRoot({ children, planId, axisX, gutter, pxPerDay, place }: DragRootProps) {
  const frame = useRef<HTMLDivElement>(null)
  const origin = useRef<Origin | null>(null)
  const [held, setHeld] = useState<Held | null>(null)
  const [said, setSaid] = useState<Said | null>(null)
  const settled: Settled | null = held === null ? null : settledAt(held, scaleFor({ pxPerDay, gutter }), axisX)
  const send = async (featureId: string, to: DropTarget, back: DropTarget | null) => {
    if (place === null) return
    const answer = await orNoAnswer(place)(planId, featureId, to)
    setSaid({ text: answer.ok ? MOVED : answer.detail, featureId, back: answer.ok ? back : null })
  }
  const start = (event: PointerEvent<HTMLDivElement>) => {
    const canvas = place === null ? null : (frame.current?.querySelector(CANVAS) ?? null)
    const begun = canvas === null ? null : heldFrom(event.target, canvas)
    if (canvas === null || begun === null) return
    origin.current = originAt({ x: event.clientX, y: event.clientY }, begun.box, canvas.getBoundingClientRect().width)
    setHeld(begun)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const from = origin.current
    const at = { x: event.clientX, y: event.clientY }
    setHeld((was) => (was === null || from === null ? was : { ...was, travelled: travelledBy(from, at) }))
  }
  const finish = () => {
    setHeld(null)
    if (held === null || settled === null || settled.to === null || unchanged(settled)) return
    void send(held.grabbed.featureId, settled.to, settled.back)
  }
  return (
    <div className={FRAME} data-drag={place !== null} data-slot="drag-root" onPointerDown={start} onPointerLeave={() => setHeld(null)} onPointerMove={move} onPointerUp={finish} ref={frame}>
      {children}
      {held === null || settled === null ? null : <DragGhost held={held} refused={settled.to === null} />}
      <DragNotice said={said} undo={(featureId, back) => void send(featureId, back, null)} />
    </div>
  )
}
