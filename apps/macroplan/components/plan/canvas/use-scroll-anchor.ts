import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { scrollFor } from './pointer-view'

const SCROLLER = '[data-slot="plan-board"]'

/**
 * The element that scrolls the timeline sideways, found from the pointer root.
 *
 * Exported because the wheel gesture needs it for a second reason this module has no opinion about —
 * reading the scroll position and the pane's left edge to work out which day is under the pointer —
 * and two `querySelector` calls for one element is one selector too many to keep in step.
 *
 * ### Why the slot is the board and not a scroller of its own
 *
 * It was `timeline-scroller`, which was the inner pane of a two-element board: a vertical scroller
 * holding a sticky column of rail names beside a horizontal one holding the canvas. The restyle
 * collapsed those into **one** `overflow-auto` board with the names `sticky left-0` inside it, and the
 * inner element went with them — so this selector matched nothing, `scrollerIn` answered `null`, and
 * every gesture built on it stopped moving the pane while continuing to change the zoom. A wheel zoom
 * threw the reader to day zero, a group chip selected without going there, and nothing failed loudly
 * enough to notice: the anchor's whole contract is to do nothing when there is no scroller.
 *
 * `happy-dom` lays nothing out, so no test here could have caught it — which is why the harnesses that
 * stand in for the board carry this slot now, and why it was found in a browser (ADR 0055).
 */
export const scrollerIn = (frame: RefObject<HTMLDivElement | null>): HTMLElement | null => {
  const found = frame.current?.querySelector(SCROLLER) ?? null
  return found instanceof HTMLElement ? found : null
}

/** What an anchor needs: where to look for the scroller, and the axis it is scrolling over. */
export interface AnchorQuery {
  readonly frame: RefObject<HTMLDivElement | null>

  readonly axisX: number

  readonly pxPerDay: number
}

/** The two ways to land a day at a place in the pane. */
export interface Anchoring {
  /**
   * Land this day at this offset **once the scale next changes**.
   *
   * For a gesture that asked the server to redraw at a different stop. Calling it twice before a
   * redraw keeps the second, which is right: the last thing asked for is the thing wanted.
   */
  readonly after: (day: number, pointerOffset: number) => void

  /** Land it **now**, at the scale already on screen. */
  readonly now: (day: number, pointerOffset: number) => void
}

/**
 * Putting a working day at a chosen place in the pane, before or after the scale changes under it.
 *
 * ### Why there are two halves
 *
 * A zoom is a Server Action, a `revalidatePath` and a re-render, and the new scale arrives here as a
 * **prop** — after the server has redrawn. So a gesture that changes the stop cannot scroll when its
 * action resolves, because the canvas it would be scrolling is still the old one, drawn at the old
 * `pxPerDay`. {@link Anchoring.after} records the day and the effect below applies it when `pxPerDay`
 * changes: the two halves of one round trip, each where it can see the number it needs.
 *
 * A gesture that does **not** change the stop has no round trip to wait for, and
 * {@link Anchoring.now} is for that. Without it, clicking a group that already fits at the stop on
 * screen would select the group and move nothing, which reads as the chip half-working.
 *
 * ### Why it is its own hook
 *
 * Two gestures need it — a wheel zoom and a group chip — and they must not each keep their own idea
 * of where the pane should end up. The arithmetic is `pointer-view.ts`'s `scrollFor` and is covered
 * there; what is here is the ref that survives a render and the effect that spends it.
 *
 * `happy-dom` lays nothing out, so a browser is the only place the *result* can be judged — but the
 * number written to `scrollLeft` is pure arithmetic over props, and that much is tested.
 */
export function useScrollAnchor({ frame, axisX, pxPerDay }: AnchorQuery): Anchoring {
  const held = useRef<{ readonly day: number; readonly pointerOffset: number } | null>(null)

  useEffect(() => {
    const back = held.current
    held.current = null
    const scroller = scrollerIn(frame)
    if (back === null || scroller === null) return
    scroller.scrollLeft = scrollFor({ ...back, axisX, pxPerDay })
  }, [axisX, frame, pxPerDay])

  const now = useCallback(
    (day: number, pointerOffset: number): void => {
      const scroller = scrollerIn(frame)
      if (scroller !== null) scroller.scrollLeft = scrollFor({ day, pointerOffset, axisX, pxPerDay })
    },
    [axisX, frame, pxPerDay],
  )

  const after = useCallback((day: number, pointerOffset: number): void => {
    held.current = { day, pointerOffset }
  }, [])

  return useMemo(() => ({ after, now }), [after, now])
}
