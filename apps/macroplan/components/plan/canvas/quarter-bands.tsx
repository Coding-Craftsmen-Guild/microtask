import type { Plan } from '@repo/api-client'
import { quarterBands } from '@repo/canvas'
import type { DayRange, PlanScale } from '@repo/canvas'
import { LAYOUT, labelX } from './view'

const EVEN_BAND = 'fill-foreground/[0.03]'

const ODD_BAND = 'fill-transparent'

const BAND_LABEL = 'fill-muted-foreground text-[11px] font-semibold tracking-wide'

/** Props for {@link QuarterBandLayer}. */
export interface QuarterBandLayerProps {
  /** The plan, read for its `startDate`, `sprintLengthDays` and `timezone` alone. */
  readonly plan: Plan

  /** The scale every x and width is computed at. */
  readonly scale: PlanScale

  /** The working days on screen, which decides which bands exist. */
  readonly range: DayRange

  /** The canvas's full height, so a band's tint runs behind every rail. */
  readonly height: number
}

/**
 * The quarter bands behind the whole canvas, alternately tinted, each labelled `Q1`, `Q2`.
 *
 * A "quarter" is six sprints counted from the plan's own `startDate`, not a calendar quarter —
 * `SPRINTS_PER_QUARTER` argues why, and it is the reason a band carries an ordinal and never a month
 * name. Nothing here computes one: `quarterBands` is handed the plan and answers the bands the range
 * intersects, whole and unclipped, and this draws them.
 *
 * The plan goes in as the value rather than as a spread. `PlanView` satisfies `PlanCalendar`
 * structurally with no adapter, but `{ ...plan }` would be a fresh object literal and excess-property
 * checking would then reject every field a calendar has no use for.
 *
 * Every label's x goes through {@link labelX}, because the `viewBox` clips a `<rect>` and not a
 * `<text>`: the leftmost band on a scrolled canvas starts off-screen, and its label would go with it.
 */
export function QuarterBandLayer({ plan, scale, range, height }: QuarterBandLayerProps) {
  return (
    <g data-slot="quarter-bands">
      {quarterBands(plan, scale, range).map((band) => (
        <g data-quarter={band.quarter} data-slot="quarter-band" key={band.quarter}>
          <rect
            className={band.quarter % 2 === 0 ? EVEN_BAND : ODD_BAND}
            height={height}
            width={band.width}
            x={band.x}
            y={0}
          />
          <text className={BAND_LABEL} x={labelX(band.x, scale, range)} y={LAYOUT.labelBaseline}>
            {band.label}
          </text>
        </g>
      ))}
    </g>
  )
}
