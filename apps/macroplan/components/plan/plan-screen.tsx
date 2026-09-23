import type { Plan } from '@repo/api-client'
import { PlanCanvas } from './canvas/plan-canvas'

const SCROLLER = 'overflow-x-auto rounded-xl bg-card p-3 ring-1 ring-foreground/10'

/** Props for {@link PlanScreen}. */
export interface PlanScreenProps {
  /** The plan and the schedule derived from it, exactly as `GET /plans/{planId}` answered. */
  readonly plan: Plan

  /** The instant the page was rendered, threaded down so the whole screen dates itself alike. */
  readonly at: Date
}

/**
 * One plan's own page: its name, how it is timed, and its timeline.
 *
 * It ships with the canvas alone. Task 13 adds the table view beside it and switches the two — spec
 * §5 makes the table "a first-class second rendering of the same data, not an afterthought", and it is
 * this canvas's accessible peer — so this component is where that switch will live rather than a
 * wrapper invented for it later.
 *
 * The scroll container is **this component's and not `Page`'s**. `@repo/ui`'s `Page` supplies width
 * and padding and deliberately no `overflow-x`, so a timeline wider than the column has to bring its
 * own scroller; a page-level one would scroll the plan's name and settings line with the bars.
 *
 * The settings line repeats what the list row said, because this is the first page that can be
 * reached by its own URL and an admin who arrived here from a link has seen no row. The three values
 * are also the three the canvas's whole axis is derived from — the `startDate` day 0 counts from, the
 * `sprintLengthDays` a gridline is spaced by, and the `timezone` today is read in — so a bar that
 * looks wrong is checkable against them without opening a drawer.
 */
export function PlanScreen({ plan, at }: PlanScreenProps) {
  return (
    <div className="grid gap-4 pt-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold" data-testid="plan-name">
          {plan.name}
        </h1>
        <p className="text-[13px] text-muted-foreground" data-testid="plan-settings">
          {`starts ${plan.startDate} · ${String(plan.sprintLengthDays)}-day sprints · ${plan.timezone}`}
        </p>
      </div>
      <div className={SCROLLER}>
        <PlanCanvas at={at} plan={plan} />
      </div>
    </div>
  )
}
