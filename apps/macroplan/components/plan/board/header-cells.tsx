import type { CalendarBand, MonthBand, SprintTick } from '@repo/canvas'
import { TIME } from './board-css'

/**
 * The narrowest cell that still gets its quarter's name, in px.
 *
 * ### Why a label is dropped rather than merely clipped
 *
 * Each cell clips to its own band, which is what stops a sliver of a quarter printing on top of the
 * next one's name. That left a second way to look broken: a plan opening four working days before Q4
 * 2026 sits in a Q3 2026 whose visible cell is a few pixels wide, and clipping drew a lone `Q` in the
 * corner of the page. One letter is not a quarter, and a reader cannot tell it from a fault.
 *
 * So a band narrower than this draws its cell — the band is real and the grid stays unbroken — and no
 * text. Nothing legible is lost.
 *
 * 48 is `Q4 2026` at this row's own size plus its padding, measured in a browser rather than derived,
 * because `happy-dom` answers every text measurement with zero and nothing here can ask.
 */
export const NAMEABLE = 48

/**
 * The same threshold for a month cell, which carries three letters rather than seven.
 *
 * A month band can be clamped as hard as a quarter band — a plan opening inside September leaves
 * September's cell most of a month behind day zero — and a clipped `O` reads as a fault for exactly
 * the reason {@link NAMEABLE} exists. Reusing 48 would drop the name off cells wide enough to carry
 * it, so the budget is the one this row's own words need.
 */
export const NAMEABLE_MONTH = 24

/** Where one band's heading sits in the row, after clamping. */
export interface BandCell {
  readonly left: number

  readonly width: number
}

/**
 * The two numbers {@link cellOf} needs, named structurally so one clamp serves both rows.
 *
 * A quarter band and a month band are clamped identically and for the same reason — each can open
 * before the axis does — and neither has anything else {@link cellOf} reads. Taking the shape rather
 * than either type is what stops the second row growing a second, subtly different clamp.
 */
export interface Placed {
  readonly x: number

  readonly width: number
}

/**
 * One band's cell, clamped so a band that opens off screen still shows its name.
 *
 * ### Why clamping is needed now and was not before
 *
 * A band used to start on the plan's own day zero, because a quarter was six sprints counted from
 * there. A **calendar** quarter opens whenever the calendar says: a plan starting 2026-09-28 sits in
 * Q3 2026, a quarter that opened on 2026-07-01 — sixty working days before the plan did. Its band is
 * returned whole and unclipped, as `calendarBands` says it must be, so its `x` is negative and a cell
 * positioned at it would carry its label off the left edge. The visible two-thirds of the band would
 * then read as unlabelled.
 *
 * So the **cell** is clamped and the band is not: `left` is floored at the axis origin and exactly
 * those pixels come off the width, which leaves the cell's right edge where the band's right edge is.
 * `@repo/canvas`'s own note asks for this and says why no test there can discover it — clipping is
 * the renderer's job, and this is the renderer.
 */
export const cellOf = (band: Placed): BandCell => {
  const clamped = Math.max(band.x, 0)
  return { left: clamped, width: band.width - (clamped - band.x) }
}

/** One quarter's heading, in the top row. */
export function QuarterCell({ band }: { readonly band: CalendarBand }) {
  const cell = cellOf(band)
  return (
    <span
      className={TIME.quarter}
      data-quarter={`${String(band.year)}-${String(band.quarter)}`}
      data-slot="quarter-head"
      style={{ left: cell.left, width: cell.width }}
    >
      {cell.width < NAMEABLE ? null : band.label}
    </span>
  )
}

/** One month's heading, in the lower row at the Year stop. */
export function MonthCell({ band }: { readonly band: MonthBand }) {
  const cell = cellOf(band)
  return (
    <span
      className={TIME.week}
      data-month={`${String(band.year)}-${String(band.month)}`}
      data-slot="month-head"
      style={{ left: cell.left, width: cell.width }}
    >
      {cell.width < NAMEABLE_MONTH ? null : band.label}
    </span>
  )
}

/**
 * One sprint's heading, in the lower row at the Quarter and Sprint stops.
 *
 * It is not clamped, where the two band cells are. A sprint tick is a fixed width counted from the
 * plan's own day zero, so the only tick that can open before the axis is one for a negative sprint,
 * which a bled range never reaches to the left — `chromeRange` bleeds rightwards only.
 *
 * The `title` is the one place a real calendar date appears in this row, which spec §5 allows on
 * hover and not as permanent chrome.
 */
export function WeekCell({ tick }: { readonly tick: SprintTick }) {
  return (
    <span
      className={TIME.week}
      data-slot="week-head"
      data-sprint={tick.sprint}
      style={{ left: tick.x, width: tick.width }}
      title={`${tick.from} to ${tick.to}`}
    >
      {tick.label}
    </span>
  )
}
