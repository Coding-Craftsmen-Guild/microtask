import type { Plan } from '@repo/api-client'
import { PlanCanvas } from './canvas/plan-canvas'
import { PlanTable } from './table/plan-table'

const VIEWS = 'flex flex-wrap items-center gap-x-2 gap-y-4'

const TIMELINE_ID = 'plan-view-timeline'

const TABLE_ID = 'plan-view-table'

const TIMELINE_RADIO = 'peer/timeline sr-only'

const TABLE_RADIO = 'peer/table sr-only'

const TIMELINE_TAB =
  'cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted-foreground ring-1 ring-foreground/10 peer-checked/timeline:bg-card peer-checked/timeline:text-foreground peer-focus-visible/timeline:ring-2 peer-focus-visible/timeline:ring-brand'

const TABLE_TAB =
  'cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted-foreground ring-1 ring-foreground/10 peer-checked/table:bg-card peer-checked/table:text-foreground peer-focus-visible/table:ring-2 peer-focus-visible/table:ring-brand'

const SCROLLER =
  'w-full overflow-x-auto rounded-xl bg-card p-3 ring-1 ring-foreground/10 peer-checked/table:hidden'

const TABLE_PANEL =
  'w-full rounded-xl bg-card p-3 ring-1 ring-foreground/10 peer-checked/timeline:sr-only'

/** Props for {@link PlanScreen}. */
export interface PlanScreenProps {
  /** The plan and the schedule derived from it, exactly as `GET /plans/{planId}` answered. */
  readonly plan: Plan

  /** The instant the page was rendered, threaded down so the whole screen dates itself alike. */
  readonly at: Date
}

/**
 * One plan's own page: its name, how it is timed, and its timeline — twice, once for the eye and once
 * for a reader.
 *
 * The scroll container is **this component's and not `Page`'s**. `@repo/ui`'s `Page` supplies width
 * and padding and deliberately no `overflow-x`, so a timeline wider than the column has to bring its
 * own scroller; a page-level one would scroll the plan's name and settings line with the bars. The
 * table sits **outside** that scroller: it is as wide as the column and wraps, and a table inside a
 * horizontal scroller would be reachable only by scrolling past a picture.
 *
 * Neither the name nor the settings line carries a `data-testid`. The name is the page's `h1` and the
 * settings line is one unambiguous sentence, so a role query and a text query reach both — and those
 * catch a regression a test hook cannot: an `h1` demoted to a `div` keeps its hook and loses its
 * heading. The list row keeps its own hooks, because a list has many rows and no headings.
 *
 * The settings line repeats what the list row said, because this is the first page that can be
 * reached by its own URL and an admin who arrived here from a link has seen no row. The three values
 * are also the three the canvas's whole axis is derived from — the `startDate` day 0 counts from, the
 * `sprintLengthDays` a gridline is spaced by, and the `timezone` today is read in — so a bar that
 * looks wrong is checkable against them without opening a drawer.
 *
 * ### The switch, and why it is two radios and no JavaScript
 *
 * `@repo/ui`'s vendored `components/tabs` is `'use client'` and wraps Radix's `Tabs`, which mounts
 * only the selected panel and marks the other `hidden` — so it would take the table **out of the
 * accessibility tree** exactly when the timeline is on screen, which is the one thing §5 says must not
 * happen, and it would ship a runtime to do it. Two `<input type="radio">` and their labels express
 * the same choice natively: the browser owns the state, this whole screen stays a Server Component,
 * and there is nothing to hydrate.
 *
 * Both renderings are **always mounted**, and the asymmetry between them is deliberate. The canvas is
 * `display:none` when the table is chosen — it is one `role="img"` graphic, so hiding it costs a
 * screen reader one label. The table is never hidden: it is `sr-only` when the timeline is chosen,
 * which keeps every row in the accessibility tree while taking it off screen, so a reader is never
 * told to switch views to reach the only rendering it can read. The cost is that the table's markup is
 * always sent — 2,200 rows at this product's cap, which is what `plan-table.test.tsx` renders — and
 * that a reader hears both renderings at once. The second is the point rather than a defect.
 *
 * The four controls and the two panels are **siblings under one flex parent**, because a `peer-*`
 * variant is a sibling selector: a wrapper around the radios for layout would break the only
 * connection that makes the switch work. The radios are `sr-only`, so they are out of flow and cost
 * the layout nothing, and each panel is `w-full`, so it takes a line of its own under the two tabs.
 */
export function PlanScreen({ plan, at }: PlanScreenProps) {
  return (
    <div className="grid gap-4 pt-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{plan.name}</h1>
        <p className="text-[13px] text-muted-foreground">
          {`starts ${plan.startDate} · ${String(plan.sprintLengthDays)}-day sprints · ${plan.timezone}`}
        </p>
      </div>
      <div className={VIEWS}>
        <input
          className={TIMELINE_RADIO}
          defaultChecked
          id={TIMELINE_ID}
          name="plan-view"
          type="radio"
        />
        <label className={TIMELINE_TAB} htmlFor={TIMELINE_ID}>
          Timeline
        </label>
        <input className={TABLE_RADIO} id={TABLE_ID} name="plan-view" type="radio" />
        <label className={TABLE_TAB} htmlFor={TABLE_ID}>
          Table
        </label>
        <div className={SCROLLER}>
          <PlanCanvas at={at} plan={plan} />
        </div>
        <div className={TABLE_PANEL}>
          <PlanTable plan={plan} />
        </div>
      </div>
    </div>
  )
}
