import { calendarBands, monthBands, sprintTicks } from '@repo/canvas'
import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import { chromeRange } from '../canvas/view'
import type { PlanScreenModel } from '../plan-screen-model'
import { HEADER_HEIGHT, QUARTER_HEIGHT, TIME } from './board-css'
import { MonthCell, QuarterCell, WeekCell } from './header-cells'

const WEEK_HEIGHT = HEADER_HEIGHT - QUARTER_HEIGHT

const MONTHLY: Rung = 'epic'

/** Props for {@link TimeHeader}. */
export interface TimeHeaderProps {
  readonly plan: PlanScreenModel

  readonly scale: PlanScale

  readonly range: DayRange

  /**
   * Which stop is drawn, which decides what the second row counts in.
   *
   * Passed rather than derived from the range with `rungFor`, for the reason `CanvasQuery` states:
   * the range follows the plan's own span, so a short plan at the Year stop produces a range
   * `rungFor` would call `item`, and the header would label in weeks under a canvas drawing a
   * rollup. The two must agree, and the only way to be sure is for both to be told.
   */
  readonly rung: Rung

  /** The canvas width, so the header is exactly as wide as the thing it labels. */
  readonly width: number
}

/**
 * The calendar headings, as HTML positioned over the same x axis the canvas uses.
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
 * `calendarBands`, `monthBands` and `sprintTicks` are the canvas's own geometry, called here with the
 * same scale and the same `chromeRange`. Two sources for one axis is two things to drift; this way a
 * heading is over its band because both were computed from one number.
 *
 * ### What the second row counts in, and why only the Year stop changed
 *
 * The top row is a **calendar** quarter and the second row used to be a **sprint** tick at every
 * stop. Those two families of edges coincide only by accident: a quarter opens on the first working
 * day of January, April, July or October, and a sprint opens `sprintLengthDays` after the plan's own
 * day zero. At the Year stop that produced two rows of boxes disagreeing everywhere, at four pixels
 * a day, with `W40–41` in a forty-pixel cell — which is what made that view look broken rather than
 * merely dense.
 *
 * A quarter is exactly three calendar months, so months nest where sprints cannot. At {@link MONTHLY}
 * the second row is `monthBands`, and every line in it is one the row above either shares or sits
 * inside. The other two stops keep their sprint ticks: a reader there is looking at individual work,
 * and the boundary that matters is the one the plan is scheduled against. The misalignment survives
 * at those stops and is correct — two true statements about time, drawn where both are legible.
 *
 * `./time-grid.tsx` reads the same `rung` and rules the same boundaries down the canvas, which is
 * why neither file decides for itself what a row counts in.
 *
 * ### Why the range is bled
 *
 * The canvas fills a pane it was not told the width of, so the chrome is drawn past the days the
 * marks use and whatever is not reached is clipped. `chromeRange` carries the argument; the point
 * here is only that the header and the grid under it are bled by the **same** call, so a cell and
 * the rule beneath it cannot end at different days.
 */
export function TimeHeader({ plan, scale, range, rung, width }: TimeHeaderProps) {
  const drawn = chromeRange(range)
  return (
    <div className={TIME.header} data-slot="time-header" style={{ width }}>
      <div className={TIME.quarterRow} style={{ height: QUARTER_HEIGHT, width }}>
        {calendarBands(plan, scale, drawn).map((band) => (
          <QuarterCell band={band} key={`${String(band.year)}-${String(band.quarter)}`} />
        ))}
      </div>
      <div className={TIME.weekRow} style={{ height: WEEK_HEIGHT, width }}>
        {rung === MONTHLY
          ? monthBands(plan, scale, drawn).map((band) => (
              <MonthCell band={band} key={`${String(band.year)}-${String(band.month)}`} />
            ))
          : sprintTicks(plan, scale, drawn).map((tick) => <WeekCell key={tick.sprint} tick={tick} />)}
      </div>
    </div>
  )
}
