import { quarterBands, sprintTicks } from '@repo/canvas'
import type { DayRange, PlanScale } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'
import { HEADER_HEIGHT, QUARTER_HEIGHT, TIME } from './board-css'

const WEEK_HEIGHT = HEADER_HEIGHT - QUARTER_HEIGHT

/** Props for {@link TimeHeader}. */
export interface TimeHeaderProps {
  readonly plan: PlanScreenModel

  readonly scale: PlanScale

  readonly range: DayRange

  /** The canvas width, so the header is exactly as wide as the thing it labels. */
  readonly width: number
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
 * `quarterBands` and `sprintTicks` are the canvas's own geometry, called here with the same scale
 * and range. Two sources for one axis is two things to drift; this way a heading is over its band
 * because both were computed from one number.
 */
export function TimeHeader({ plan, scale, range, width }: TimeHeaderProps) {
  const bands = quarterBands(plan, scale, range)
  const ticks = sprintTicks(plan, scale, range)
  return (
    <div className={TIME.header} data-slot="time-header" style={{ width }}>
      <div
        className={TIME.quarterRow}
        style={{ height: QUARTER_HEIGHT, width }}
      >
        {bands.map((band) => (
          <span
            className={TIME.quarter}
            data-quarter={band.quarter}
            data-slot="quarter-head"
            key={band.quarter}
            style={{ left: band.x, width: band.width }}
          >
            {band.label}
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
