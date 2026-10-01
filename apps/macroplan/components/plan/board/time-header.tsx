import { calendarBands, sprintTicks } from '@repo/canvas'
import type { CalendarBand, DayRange, PlanScale } from '@repo/canvas'
import { chromeRange } from '../canvas/view'
import type { PlanScreenModel } from '../plan-screen-model'
import { HEADER_HEIGHT, QUARTER_HEIGHT, TIME } from './board-css'

const WEEK_HEIGHT = HEADER_HEIGHT - QUARTER_HEIGHT

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
 * because `happy-dom` answers every text measurement with zero and nothing here can ask. It is the
 * same trade `canvas/bar-label.tsx` makes with `MIN_READABLE`, where the budget is in characters
 * rather than in pixels.
 */
export const NAMEABLE = 48

/** Props for {@link TimeHeader}. */
export interface TimeHeaderProps {
  readonly plan: PlanScreenModel

  readonly scale: PlanScale

  readonly range: DayRange

  /** The canvas width, so the header is exactly as wide as the thing it labels. */
  readonly width: number
}

/** Where one band's heading sits in the row, after clamping. */
export interface BandCell {
  readonly left: number

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
export const cellOf = (band: CalendarBand): BandCell => {
  const clamped = Math.max(band.x, 0)
  return { left: clamped, width: band.width - (clamped - band.x) }
}

/**
 * The quarter and sprint headings, as HTML positioned over the same x axis the canvas uses.
 *
 * ### Why it is not in the SVG
 *
 * It was, and it clipped. A `<text>` at a band's x is drawn at that x whether or not the band is on
 * screen, so the first revision routed every heading through a `labelX` clamp to keep the current
 * quarter's name from scrolling out of its own band. As HTML each heading is a box inside a
 * positioned row, `overflow-hidden` does the clipping, and a long name simply ellipsises.
 *
 * It also lets the row be `sticky top-0`, so the dates stay on screen while a tall plan scrolls —
 * which an SVG element inside a `viewBox` cannot do at all.
 *
 * ### Why the numbers come from the same functions the canvas uses
 *
 * `calendarBands` and `sprintTicks` are the canvas's own geometry, called here with the same scale
 * and the same `chromeRange`. Two sources for one axis is two things to drift; this way a heading is
 * over its band because both were computed from one number.
 *
 * ### Why the range is bled
 *
 * The canvas fills a pane it was not told the width of, so the chrome is drawn past the days the
 * marks use and whatever is not reached is clipped. `chromeRange` carries the argument; the point
 * here is only that the header and the grid under it are bled by the **same** call, so a week cell
 * and the rule beneath it cannot end at different days.
 */
export function TimeHeader({ plan, scale, range, width }: TimeHeaderProps) {
  const drawn = chromeRange(range)
  const bands = calendarBands(plan, scale, drawn)
  const ticks = sprintTicks(plan, scale, drawn)
  return (
    <div className={TIME.header} data-slot="time-header" style={{ width }}>
      <div
        className={TIME.quarterRow}
        style={{ height: QUARTER_HEIGHT, width }}
      >
        {bands.map((band) => (
          <span
            className={TIME.quarter}
            data-quarter={`${String(band.year)}-${String(band.quarter)}`}
            data-slot="quarter-head"
            key={`${String(band.year)}-${String(band.quarter)}`}
            style={{ left: cellOf(band).left, width: cellOf(band).width }}
          >
            {cellOf(band).width < NAMEABLE ? null : band.label}
          </span>
        ))}
      </div>
      <div className={TIME.weekRow} style={{ height: WEEK_HEIGHT, width }}>
        {ticks.map((tick) => (
          <span
            className={TIME.week}
            data-slot="week-head"
            data-sprint={tick.sprint}
            key={tick.sprint}
            style={{ left: tick.x, width: tick.width }}
            title={`${tick.from} to ${tick.to}`}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  )
}
