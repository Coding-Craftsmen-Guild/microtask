import type { Plan } from '@repo/api-client'
import { sprintTicks } from '@repo/canvas'
import type { DayRange, PlanScale } from '@repo/canvas'
import { LAYOUT, labelX } from './view'

const TICK_LINE = 'stroke-foreground/10'

const TICK_LABEL = 'fill-muted-foreground text-[10px]'

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
 * One gridline and one `W1–2` label per sprint the viewport touches.
 *
 * Spec §3.3: sprints are gridlines, not containers — so a tick is a line at the sprint's own left
 * edge and never a box a bar is drawn inside. The line runs the whole height, which is what makes a
 * bar's start readable against the sprint it falls in.
 *
 * The label is `sprintTicks`' own, week numbers counted from the plan's first week with an en dash,
 * and nothing here reformats it. **`tick.from` and `tick.to` are deliberately not drawn**: §5 has it
 * that "real calendar dates appear on hover, never as permanent chrome", and they are carried on the
 * tick for Task 14's tooltip to reveal. `to` is the one inclusive range in the codebase, which is a
 * second reason not to put it on the axis beside offsets that are all exclusive.
 */
export function SprintTickLayer({ plan, scale, range, height }: SprintTickLayerProps) {
  return (
    <g data-slot="sprint-ticks">
      {sprintTicks(plan, scale, range).map((tick) => (
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
    </g>
  )
}
