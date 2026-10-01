'use client'

import type { Rung } from '@repo/canvas'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { splitDetail, type Detail } from './detail-lines'
import { HoverCard } from './hover-card'
import { lightThread } from './pointer-lights'
import { cardAt, plainClick } from './pointer-view'
import { useGroupFit } from './use-group-fit'
import { useScrollAnchor } from './use-scroll-anchor'
import { useWheelZoom } from './use-wheel-zoom'

const FRAME = 'contents'

const LINK = '[data-slot="feature-link"]'

const HOVERABLE = '[data-hover-id]'

const FINEST: Rung = 'item'

const CARD_SIZE = { width: 300, height: 170 }

interface Shown {
  readonly detail: Detail
  readonly left: number
  readonly top: number
}

/** Props for {@link PlanPointer}. */
export interface PlanPointerProps {
  /**
   * The whole plan screen, server-rendered, handed through untouched.
   *
   * The second component in this app to use the one exception `../module-boundaries.test.tsx` states —
   * markup on `children`, and on no other prop. `./drag-root.tsx` is the first and carries the argument
   * in full: a client component may *wrap* server markup, and what is refused is data. Nothing under
   * here becomes a client component and no per-mark prop enters the Flight payload.
   */
  readonly children: ReactNode

  /** The rung the canvas below was drawn at, which is what a gesture steps from. */
  readonly rung: Rung

  /** How wide a working day is at that rung, for putting a day back under the pointer. */
  readonly pxPerDay: number

  /** The x of the first drawn day, which is the canvas's own `axisX`. */
  readonly axisX: number

  /**
   * The zoom write, or `null` on a surface that cannot remember one.
   *
   * The seat surface is that surface: it has no cookie of its own and no zoom control, so a gesture
   * there must do nothing at all rather than silently swallow a scroll. Unbound, like every other action
   * crossing this boundary.
   */
  readonly zoomTo: ((rung: string) => Promise<void>) | null
}

/**
 * The one client root over the plan: it zooms on a wheel, drills on a click, and draws a card on a hover.
 *
 * ### Why four gestures are one component
 *
 * They are four readings of the same two attributes. Every mark the server drew carries `data-hover-id` —
 * which feature's thread it belongs to — and `data-detail`, the card to show for it; a bar is already an
 * `<a>`; and the time header is already a slot. So each gesture is `closest()` on the event's target,
 * which is what `./drag-root.tsx` does and for the same reason: the canvas is a Server Component of some
 * two thousand nodes (ADR 0058) and nothing here may re-render it, hand it to the browser, or put an
 * island on each of its marks.
 *
 * It wraps the **whole screen** rather than the board, which is what makes item 8 the same feature as
 * item 6 rather than a second one: a pointer over a row in the rail tree and a pointer over a bar on the
 * canvas are two elements carrying the same pair of attributes, and one listener sees both. `contents` is
 * the frame, so this adds a listener and no box — the shell keeps its own height and its own containing
 * block, and events bubble through regardless of layout.
 *
 * The wheel is `./use-wheel-zoom.ts`, which has to register its own non-passive listener and carries why.
 * A fifth gesture joined them on the same terms: `./use-group-fit.ts` fits the timeline to a group when
 * its chip is clicked, reading the stop and the day the server wrote onto the chip. It is here rather
 * than beside the chips because this is the root that already holds the zoom write and the scroller, and
 * because the chips are inside it.
 *
 * Both zoom gestures share one `./use-scroll-anchor.ts`, so neither can keep its own idea of where the
 * pane should end up.
 *
 * ### The click, and why it is in the bubble phase
 *
 * At the Year or Quarter rung, clicking a mark drills to **Sprint** — the finest rung, not one step —
 * and then opens the feature, which is the two halves of item 5. The action is awaited first, so the
 * drawer opens over a canvas already drawn at the rung that was asked for. At Sprint the link is left
 * entirely alone, so it still middle-clicks and still opens in a new tab.
 *
 * `DragRoot` cancels the click that follows a drag, and it does so in the **capture** phase, which runs
 * outside in. A bubble-phase listener here therefore sees that cancellation and a drag cannot drill;
 * `plainClick` is where that test lives, beside the modifier keys it belongs with.
 *
 * ### Lighting, and the card
 *
 * A hover lights everything sharing the hovered `data-hover-id` plus the arcs at either end of it
 * (`./pointer-lights.ts`), and puts up the card the mark itself carried. A mark with an id and no card —
 * the `<rect>` inside a bar's link — lights its thread and shows nothing, which is right: the bar beside
 * it is the thing with something to say.
 *
 * `pointerout` is checked against where the pointer went: moving between two marks of one thread would
 * otherwise put the card down and up again on every boundary crossed.
 */
export function PlanPointer({ children, rung, pxPerDay, axisX, zoomTo }: PlanPointerProps) {
  const router = useRouter()
  const frame = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<Shown | null>(null)
  const anchor = useScrollAnchor({ frame, axisX, pxPerDay })
  useWheelZoom({ frame, rung, pxPerDay, axisX, anchor, zoomTo })
  useGroupFit({ frame, rung, anchor, zoomTo })

  const drill = async (href: string): Promise<void> => {
    if (zoomTo !== null) await zoomTo(FINEST)
    router.push(href)
  }

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (zoomTo === null || rung === FINEST || !plainClick(event)) return
    const target = event.target instanceof Element ? event.target : null
    const href = target?.closest(LINK)?.getAttribute('href') ?? null
    if (href === null) return
    event.preventDefault()
    void drill(href)
  }

  const onOver = (event: PointerEvent<HTMLDivElement>): void => {
    const target = event.target instanceof Element ? event.target : null
    const held = target?.closest(HOVERABLE) ?? null
    lightThread(frame.current, held?.getAttribute('data-hover-id') ?? '')
    const text = held?.getAttribute('data-detail') ?? ''
    const place = { ...CARD_SIZE, x: event.clientX, y: event.clientY, viewHeight: window.innerHeight, viewWidth: window.innerWidth }
    setShown(text === '' ? null : { detail: splitDetail(text), ...cardAt(place) })
  }

  const onOut = (event: PointerEvent<HTMLDivElement>): void => {
    const to = event.relatedTarget
    if (to instanceof Element && to.closest(HOVERABLE) !== null) return
    lightThread(frame.current, '')
    setShown(null)
  }

  return (
    <div
      className={FRAME}
      data-axis-x={axisX}
      data-px-per-day={pxPerDay}
      data-slot="plan-pointer"
      onClick={onClick}
      onPointerOut={onOut}
      onPointerOver={onOver}
      ref={frame}
    >
      {children}
      {shown === null ? null : <HoverCard detail={shown.detail} left={shown.left} top={shown.top} />}
    </div>
  )
}
