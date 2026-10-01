import type { Rung } from '@repo/canvas'
import { ZOOM_ORDER } from './zoom-view'

/** Which way a gesture is going: toward a finer scale, or toward a wider one. */
export type Zooming = 'in' | 'out'

/**
 * The rung one step finer or one step wider, or `null` at the end of the three.
 *
 * {@link ZOOM_ORDER} is widest first, which is the order the control offers, so stepping **in** means
 * moving along it. Answering `null` rather than the rung already on screen is what lets the caller
 * write no cookie and start no round trip for a gesture that would change nothing — a reader who keeps
 * scrolling at the Sprint rung should cost the server nothing at all.
 */
export function stepRung(rung: Rung, zooming: Zooming): Rung | null {
  const at = ZOOM_ORDER.indexOf(rung)
  const next = ZOOM_ORDER[at + (zooming === 'in' ? 1 : -1)]
  return at === -1 || next === undefined ? null : next
}

/** Where a pointer is along the axis, and how wide a day is there. */
export interface AxisAt {
  /** How far the timeline is scrolled, in px. */
  readonly scrollLeft: number

  /** The pointer's x measured from the scrolling pane's own left edge, in px. */
  readonly pointerOffset: number

  /** The x the first drawn day sits at, which is the canvas's own `axisX`. */
  readonly axisX: number

  readonly pxPerDay: number
}

/**
 * The working day under the pointer.
 *
 * ### Why this is a pure function and not three lines in the handler
 *
 * ADR 0055's rule — geometry is arithmetic a test can check, and the DOM is where measurements are
 * taken — and the reason it exists. The component reads `scrollLeft` and a bounding rect, and
 * `happy-dom` answers every rect with zeros, so a handler that both measured and converted would be a
 * conversion no test could ever see a non-zero input to. Split, the measuring is three lines with
 * nothing to get wrong and the arithmetic is covered.
 *
 * A `pxPerDay` of zero answers day zero rather than an infinity. It cannot occur — every stop declares
 * a positive scale — but this value goes on to set a scroll position, and `scrollLeft = Infinity`
 * silently clamps to the end of the plan, which looks exactly like a zoom that jumped.
 */
export const dayAt = (at: AxisAt): number =>
  at.pxPerDay === 0 ? 0 : (at.scrollLeft + at.pointerOffset - at.axisX) / at.pxPerDay

/** A day to put back under a pixel, at whatever scale is now on screen. */
export interface AxisBack {
  readonly day: number

  readonly pointerOffset: number

  readonly axisX: number

  readonly pxPerDay: number
}

/**
 * The scroll that puts a day back under the pixel it was under before the rung changed.
 *
 * Changing rung changes how wide a day is, so the same `scrollLeft` is a different date: zooming
 * without this throws the reader somewhere else in the plan, which is worse than not zooming at all.
 *
 * Floored at zero because a browser clamps a negative scroll and then disagrees with us about where
 * the timeline is — the next gesture would be anchored against a number that was never real.
 */
export const scrollFor = (back: AxisBack): number =>
  Math.max(0, back.day * back.pxPerDay + back.axisX - back.pointerOffset)

/**
 * How long a wheel gesture has to stop before the zoom it asked for is sent, in ms.
 *
 * A flick of a wheel is a dozen events and a trackpad swipe is more, and every rung change is a
 * Server Action, a revalidation and a re-render of the whole plan. So the gesture is collected and
 * answered once when it settles, which is the difference between one round trip and twelve.
 *
 * 140ms is long enough to swallow a flick and short enough that the zoom feels like part of the
 * gesture rather than something that happened afterwards.
 */
export const SETTLE_MS = 140

/** How far a card sits from the pointer, in px, on whichever side it ends up. */
export const CARD_GAP = 14

/** A pointer, a card's size, and the viewport the two have to fit in. */
export interface CardPlace {
  readonly x: number

  readonly y: number

  readonly width: number

  readonly height: number

  readonly viewWidth: number

  readonly viewHeight: number
}

const flipped = (at: number, size: number, view: number): number =>
  Math.max(0, at + CARD_GAP + size > view ? at - CARD_GAP - size : at + CARD_GAP)

/**
 * Where to put the hover card so it is beside the pointer and on the screen.
 *
 * Below and to the right by default, which keeps it clear of the mark being pointed at and out of the
 * way of the pointer's own arrow. Each axis flips independently when the card would otherwise run off
 * that edge, so a bar at the right of a wide plan gets a card to its left and a bar at the bottom gets
 * one above, and a bar in the bottom-right corner gets both.
 *
 * Clamped to zero last, which is what a viewport too small to flip into gets: part of the card over
 * the pointer is a card somebody can read, and a card at `-40` is a card with its title cut off.
 */
export const cardAt = (place: CardPlace): { readonly left: number; readonly top: number } => ({
  left: flipped(place.x, place.width, place.viewWidth),
  top: flipped(place.y, place.height, place.viewHeight),
})

/** What a wheel event carried, and whether it landed on the ruler. */
export interface WheelAsked {
  readonly ctrlKey: boolean

  readonly metaKey: boolean

  readonly deltaY: number

  /** Whether the pointer was over the time header, which is the one place a plain wheel zooms. */
  readonly overHeader: boolean
}

/** What to do with one wheel event: whether to swallow it, and which way to step if at all. */
export interface WheelAnswer {
  readonly prevent: boolean

  readonly zooming: Zooming | null
}

/**
 * Whether a wheel is a scroll or a zoom, and which way.
 *
 * ### The two gestures, and the one this must not steal
 *
 * The timeline pane scrolls vertically — a plan with more rails than fit is read by scrolling it — so a
 * root that zoomed on every wheel would take that away silently. **Ctrl or Cmd with a wheel** zooms,
 * which is also what a trackpad pinch sends; a **plain wheel over the time header** zooms, that row
 * having nothing of its own to scroll and being the thing the zoom is about; everything else scrolls.
 *
 * ### Why `prevent` and `zooming` are two answers and not one
 *
 * At the last stop in a direction there is nothing to step to, and the two gestures want **different**
 * answers to "so what happens to the event". A modified wheel is still swallowed, because the default
 * for Ctrl+wheel is the browser zooming the whole page and nobody asking a plan to zoom in further meant
 * that. A plain wheel over the header is given back, because its default is scrolling the plan, which is
 * a reasonable thing to let happen.
 */
export function wheelZoom(asked: WheelAsked, rung: Rung): WheelAnswer {
  const modified = asked.ctrlKey || asked.metaKey
  if (!modified && !asked.overHeader) return { prevent: false, zooming: null }
  const zooming: Zooming = asked.deltaY < 0 ? 'in' : 'out'
  return stepRung(rung, zooming) === null
    ? { prevent: modified, zooming: null }
    : { prevent: true, zooming }
}

/** The modifier state of one click, and whether anything has already cancelled it. */
export interface ClickAsked {
  readonly button: number

  readonly altKey: boolean

  readonly ctrlKey: boolean

  readonly metaKey: boolean

  readonly shiftKey: boolean

  readonly defaultPrevented: boolean
}

/**
 * Whether a click is the plain one that means "open this", rather than one the browser already owns.
 *
 * The middle button, Ctrl, Cmd and Shift are how a person opens a link in a tab or a window, and Alt is
 * how they download it; taking any of them over with a router push takes the gesture away. A click that
 * is already cancelled is left alone too, which is what `drag-root.tsx` leaves behind when a drag ends
 * over a bar — the drop already did something, and it was not "open this".
 */
export const plainClick = (asked: ClickAsked): boolean =>
  asked.button === 0 &&
  !asked.defaultPrevented &&
  !asked.altKey &&
  !asked.ctrlKey &&
  !asked.metaKey &&
  !asked.shiftKey
