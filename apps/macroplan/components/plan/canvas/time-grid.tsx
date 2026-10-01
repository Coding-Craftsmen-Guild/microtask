import { sprintTicks } from '@repo/canvas'
import type { DayRange, PlanScale, SprintTick } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'
import { chromeRange } from './view'

/**
 * Whether a sprint takes the shaded half of the alternation.
 *
 * Counted on the sprint's own index, which runs unbroken from the plan's day zero through every
 * quarter and every year it crosses — so there is no boundary at which two shaded columns can end up
 * side by side. A negative index is floored by `sprintOf` rather than folded onto zero, and `%` in
 * JavaScript keeps the sign, so the test is against a non-zero remainder rather than against `1`.
 */
export const shaded = (tick: SprintTick): boolean => tick.sprint % 2 !== 0

const SHADE = 'fill-sprint-alt'

const TICK_LINE = 'stroke-[#ededed]'

/** Props for {@link TimeGrid}. */
export interface TimeGridProps {
  readonly plan: PlanScreenModel

  readonly scale: PlanScale

  readonly range: DayRange

  readonly height: number
}

/**
 * The grid the bars sit on: one column per sprint, alternately washed, each opening on a hairline.
 *
 * ### Why it is sprints, at every stop, and nothing else
 *
 * It washed alternating **calendar quarters** and ruled either months or sprints depending on the
 * stop. That was three units of time drawn over each other — quarters behind, months or sprints in
 * front, and the header above counting in a fourth — and the lines agreed with the wash only by
 * accident, because a quarter opens on the calendar and a sprint opens `sprintLengthDays` after the
 * plan's own day zero.
 *
 * One unit now, and it is the one the plan is actually scheduled against: a feature is pinned to a
 * sprint, placed into a sprint and reported by sprint, so a column a reader can count is a column
 * that answers the question they came with. The quarters and the year are still drawn — as the two
 * tiers above the board (`../board/time-header.tsx`), where a boundary can be labelled rather than
 * guessed at from a change of shade.
 *
 * ### Why it no longer takes the rung
 *
 * It did, and had to: the header's lower row counted in months at the Year stop and in sprints at the
 * other two, and a grid ruling anything else would have put a label over a cell with no line under
 * it. Both count in sprints at every stop now (`../board/time-bands.ts` is what made that legible at
 * four pixels a day), so there is nothing left for either to disagree about and no argument to pass.
 *
 * ### Why the rule is a hex and not `border`
 *
 * The lane separators and the column rules are both hairlines and they are deliberately different
 * weights: a lane is a row of the plan and a sprint is a column of the calendar, and at the density
 * this board draws at, two greys of the same value make a plaid. This is the lighter of the two.
 */
export function TimeGrid({ plan, scale, range, height }: TimeGridProps) {
  const ticks = sprintTicks(plan, scale, chromeRange(range))
  return (
    <g data-slot="time-grid">
      {ticks.map((tick) =>
        shaded(tick) ? (
          <rect
            className={SHADE}
            data-slot="sprint-band"
            data-sprint={tick.sprint}
            height={height}
            key={tick.sprint}
            width={tick.width}
            x={tick.x}
            y={0}
          />
        ) : null,
      )}
      {ticks.map((tick) => (
        <line
          className={TICK_LINE}
          data-slot="sprint-tick"
          data-sprint={tick.sprint}
          key={tick.sprint}
          x1={tick.x}
          x2={tick.x}
          y1={0}
          y2={height}
        />
      ))}
    </g>
  )
}
