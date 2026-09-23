import type { Plan } from '@repo/api-client'
import { sprintTicks } from '@repo/canvas'
import type { DayRange, PlanScale } from '@repo/canvas'
import { sprintHover } from './hover'
import { LAYOUT, labelX } from './view'

const TICK_LINE = 'stroke-foreground/10'

const TICK_LABEL = 'fill-muted-foreground text-[10px]'

const TICK_TARGET = 'fill-transparent'

const TICK_TOP = 26

/** Props for {@link SprintTickLayer}. */
export interface SprintTickLayerProps {
  /** The plan, read for its `startDate` and `sprintLengthDays` alone. */
  readonly plan: Plan

  /** The scale every x and width is computed at. */
  readonly scale: PlanScale

  /** The working days on screen, which decides which ticks exist. */
  readonly range: DayRange

  /** The canvas's full height, so a gridline runs the length of it. */
  readonly height: number
}

/**
 * One gridline and one `W1–2` label per sprint the viewport touches, and behind them one hover
 * target per sprint carrying the two calendar dates that sprint covers.
 *
 * Spec §3.3: sprints are gridlines, not containers — so a tick is a line at the sprint's own left
 * edge and never a box a bar is drawn inside. The line runs the whole height, which is what makes a
 * bar's start readable against the sprint it falls in.
 *
 * The label is `sprintTicks`' own, week numbers counted from the plan's first week with an en dash,
 * and nothing here reformats it.
 *
 * ### The dates, and why they are an SVG `<title>` on a rect of their own
 *
 * §5: "real calendar dates appear on hover, never as permanent chrome". A `<title>` child is the
 * browser's own hover tooltip, so the date is revealed by pointing and drawn by nothing — and it
 * costs **no client boundary**: this whole screen is a Server Component with nothing to hydrate,
 * which `PlanScreen` argues at length, and a `<title>` keeps it that way where a Radix tooltip
 * would not. The accessibility objection to `<title>` does not reach here either: a `<title>`
 * names its own shape, but every shape on this canvas is inside one `role="img"`, whose subtree is
 * presentational — so these name nothing a screen reader is told, and `PlanCanvas`'s single
 * `aria-label` is still the whole of what it announces.
 *
 * The target is a **separate transparent rect** rather than the tick's own line, because a
 * gridline is one px wide and one px is not a hover target anybody hits. The rect is the sprint's
 * full width and the canvas's full height, so pointing anywhere in a sprint's column names it —
 * and it is drawn **before every rail**, so a bar painted over it wins the pointer and this stays
 * out of the way of whatever a bar's own hover becomes.
 *
 * It is also its own `<g>` rather than a child of each `data-slot="sprint-tick"` group, so a test
 * reading a tick's `textContent` still reads the label alone and can tell the drawn chrome from
 * the revealed date.
 *
 * `tick.from` and `tick.to` go onto the rect **as well as** into the sentence, the way `TodayMark`
 * carries `data-date` beside its line: the sentence is presentation and the attributes are the
 * datum, carried straight from `rangeOfSprint` and never recomputed from an offset. `to` is
 * inclusive — see {@link sprintHover}, which is where that asymmetry is rendered.
 */
export function SprintTickLayer({ plan, scale, range, height }: SprintTickLayerProps) {
  const ticks = sprintTicks(plan, scale, range)
  return (
    <g data-slot="sprint-ticks">
      {ticks.map((tick) => (
        <g data-slot="sprint-tick" data-sprint={tick.sprint} key={tick.sprint}>
          <line className={TICK_LINE} x1={tick.x} x2={tick.x} y1={TICK_TOP} y2={height} />
          <text
            className={TICK_LABEL}
            x={labelX(tick.x, scale, range)}
            y={LAYOUT.chromeHeight - LAYOUT.labelInset}
          >
            {tick.label}
          </text>
        </g>
      ))}
      <g data-slot="sprint-dates">
        {ticks.map((tick) => (
          <rect
            className={TICK_TARGET}
            data-from={tick.from}
            data-slot="sprint-date"
            data-sprint={tick.sprint}
            data-to={tick.to}
            height={height}
            key={tick.sprint}
            width={tick.width}
            x={tick.x}
            y={0}
          >
            <title>{sprintHover(tick)}</title>
          </rect>
        ))}
      </g>
    </g>
  )
}
