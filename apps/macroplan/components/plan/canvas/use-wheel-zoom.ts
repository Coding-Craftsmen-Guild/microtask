import type { Rung } from '@repo/canvas'
import { useEffect, useRef, type RefObject } from 'react'
import { dayAt, SETTLE_MS, stepRung, wheelZoom, type Zooming } from './pointer-view'
import { scrollerIn, type Anchoring } from './use-scroll-anchor'

const HEADER = '[data-slot="time-header"]'

/** What the wheel gesture needs to know about the plan it is over, and what it may do about it. */
export interface WheelZoom {
  /** The element the listener goes on, which is the root the whole screen sits inside. */
  readonly frame: RefObject<HTMLDivElement | null>

  readonly rung: Rung

  readonly pxPerDay: number

  readonly axisX: number

  /** Where to put the day that was under the pointer, once the new scale has arrived. */
  readonly anchor: Anchoring

  /** The zoom write, or `null` on a surface that cannot remember one and so listens for nothing. */
  readonly zoomTo: ((rung: string) => Promise<void>) | null
}

/**
 * Zooms the plan on a wheel, and puts the day that was under the pointer back under it afterwards.
 *
 * ### Why the listener is registered here and not as `onWheel`
 *
 * React attaches `wheel` **passively** at its root container, and a passive listener's `preventDefault`
 * does nothing at all. The whole gesture depends on preventing the default: Ctrl+wheel's default is the
 * browser zooming the entire page, so without this the page and the plan would zoom at once.
 *
 * ### Why it listens on the window and not on the root it is given
 *
 * The root is `./plan-pointer.tsx`'s frame, which covers the board, the panel and the toolbar but not
 * the brand bar above them — so a Ctrl+wheel in that strip zoomed the whole page while the same gesture
 * forty pixels lower zoomed the timeline. A modifier is not aimed at anything, and on a page whose
 * subject is one timeline the only sensible reading of "zoom" anywhere on it is that timeline.
 *
 * The ref is still what the effect waits for, because it is what says the tree is mounted, and the
 * **plain** wheel is unaffected: that one only zooms over the time header, which `wheelZoom` decides
 * from the event's own target and which exists only inside the board.
 *
 * One thing no code here can reach: a trackpad **pinch** that the browser delivers as a non-cancelable
 * `wheel`. `preventDefault` on it does nothing, by design, and the page zooms. If a zoom gesture ever
 * appears to zoom the page rather than the plan, that is the one to rule out first — the key and the
 * wheel together are handled, and a pinch may not be.
 *
 * ### Why one gesture is one request
 *
 * A rung change is a Server Action, a `revalidatePath` and a re-render of the whole plan, and a flick of
 * a wheel is a dozen events — a trackpad swipe is more. So the direction is recorded and the request is
 * made once, after {@link SETTLE_MS} of quiet. The rung is read again at that moment rather than captured
 * when the gesture began, so a step that has become impossible in the meantime is not taken.
 *
 * ### Why the scroll is somebody else's effect
 *
 * The anchor cannot be applied when the action resolves, because the canvas has not been redrawn yet: the
 * new scale arrives as a **prop**, after the server re-rendered. So the day under the pointer is recorded
 * on the way out with `Anchoring.after` and put back by `./use-scroll-anchor.ts` when `pxPerDay` changes.
 * That lives in its own hook because the group chips need the same two halves (`./use-group-fit.ts`), and
 * two gestures must not each keep their own idea of where the pane should end up.
 *
 * A gesture still settling when the rung changes keeps its timer rather than losing it to the cleanup:
 * dropping it would silently eat the second half of a quick double flick, which is a gesture somebody
 * made. The one cost is that leaving the plan with a wheel still in flight writes the cookie it asked
 * for — the zoom they wanted, on the plan they come back to.
 *
 * The arithmetic is `pointer-view.ts`'s and is covered there. What is here is the measuring, and
 * `happy-dom` answers every `getBoundingClientRect` with zeros (ADR 0055) — so **this is the slice's
 * browser-verification item**: zoom with the pointer over a date in the middle of a plan, and check that
 * the date is still under the pointer afterwards.
 */
export function useWheelZoom({ frame, rung, pxPerDay, axisX, anchor, zoomTo }: WheelZoom): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const asked = useRef<Zooming | null>(null)

  useEffect(() => {
    const root = frame.current === null ? null : window
    if (root === null || zoomTo === null) return undefined
    const remember = (clientX: number): void => {
      const scroller = scrollerIn(frame)
      if (scroller === null) return
      const pointerOffset = clientX - scroller.getBoundingClientRect().left
      const at = { scrollLeft: scroller.scrollLeft, pointerOffset, axisX, pxPerDay }
      anchor.after(dayAt(at), pointerOffset)
    }
    const fire = (): void => {
      const going = asked.current
      asked.current = null
      timer.current = null
      const next = going === null ? null : stepRung(rung, going)
      if (next !== null) void zoomTo(next)
    }
    const onWheel = (event: WheelEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      const overHeader = (target?.closest(HEADER) ?? null) !== null
      const { ctrlKey, deltaY, metaKey } = event
      const answer = wheelZoom({ ctrlKey, deltaY, metaKey, overHeader }, rung)
      if (answer.prevent) event.preventDefault()
      if (answer.zooming === null) return
      remember(event.clientX)
      asked.current = answer.zooming
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(fire, SETTLE_MS)
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      root.removeEventListener('wheel', onWheel)
    }
  }, [anchor, axisX, frame, pxPerDay, rung, zoomTo])
}
