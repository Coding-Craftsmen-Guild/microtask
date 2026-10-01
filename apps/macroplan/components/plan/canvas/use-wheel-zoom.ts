import type { Rung } from '@repo/canvas'
import { useEffect, useRef, type RefObject } from 'react'
import { dayAt, scrollFor, SETTLE_MS, stepRung, wheelZoom, type Zooming } from './pointer-view'

const SCROLLER = '[data-slot="timeline-scroller"]'

const HEADER = '[data-slot="time-header"]'

interface Anchor {
  readonly day: number
  readonly pointerOffset: number
}

/** What the wheel gesture needs to know about the plan it is over, and what it may do about it. */
export interface WheelZoom {
  /** The element the listener goes on, which is the root the whole screen sits inside. */
  readonly frame: RefObject<HTMLDivElement | null>

  readonly rung: Rung

  readonly pxPerDay: number

  readonly axisX: number

  /** The zoom write, or `null` on a surface that cannot remember one and so listens for nothing. */
  readonly zoomTo: ((rung: string) => Promise<void>) | null
}

const scrollerIn = (frame: RefObject<HTMLDivElement | null>): HTMLElement | null => {
  const found = frame.current?.querySelector(SCROLLER) ?? null
  return found instanceof HTMLElement ? found : null
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
 * ### Why one gesture is one request
 *
 * A rung change is a Server Action, a `revalidatePath` and a re-render of the whole plan, and a flick of
 * a wheel is a dozen events — a trackpad swipe is more. So the direction is recorded and the request is
 * made once, after {@link SETTLE_MS} of quiet. The rung is read again at that moment rather than captured
 * when the gesture began, so a step that has become impossible in the meantime is not taken.
 *
 * ### Why the scroll is restored in a second effect
 *
 * The anchor cannot be applied when the action resolves, because the canvas has not been redrawn yet: the
 * new scale arrives as a **prop**, after the server re-rendered. So the day is recorded on the way out and
 * the second effect, which runs when `pxPerDay` changes, is what puts it back — the two halves of one
 * round trip, each where it can actually see the number it needs.
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
export function useWheelZoom({ frame, rung, pxPerDay, axisX, zoomTo }: WheelZoom): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const asked = useRef<Zooming | null>(null)
  const anchor = useRef<Anchor | null>(null)

  useEffect(() => {
    const back = anchor.current
    anchor.current = null
    const scroller = scrollerIn(frame)
    if (back === null || scroller === null) return
    scroller.scrollLeft = scrollFor({ ...back, axisX, pxPerDay })
  }, [axisX, frame, pxPerDay])

  useEffect(() => {
    const root = frame.current
    if (root === null || zoomTo === null) return undefined
    const remember = (clientX: number): void => {
      const scroller = scrollerIn(frame)
      if (scroller === null) return
      const pointerOffset = clientX - scroller.getBoundingClientRect().left
      const at = { scrollLeft: scroller.scrollLeft, pointerOffset, axisX, pxPerDay }
      anchor.current = { day: dayAt(at), pointerOffset }
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
  }, [axisX, frame, pxPerDay, rung, zoomTo])
}
