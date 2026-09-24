import type { PlanControls } from '../../lib/plan-capabilities'
import { PlanCanvas } from './canvas/plan-canvas'
import type { PlanScreenModel } from './plan-screen-model'
import { PlanTable } from './table/plan-table'

const VIEWS = 'flex flex-wrap items-center gap-x-2 gap-y-4'

const TIMELINE_ID = 'plan-view-timeline'

const TABLE_ID = 'plan-view-table'

const HINT_ID = 'plan-view-hint'

const HINT = 'Choose which rendering of this plan is on screen. The table stays readable either way.'

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
  /**
   * The plan and the schedule derived from it — reduced by `planScreenModel`, so the type cannot
   * hold a share token and neither surface can hand this component one (ADR 0033).
   */
  readonly plan: PlanScreenModel

  /** The instant the page was rendered, threaded down so the whole screen dates itself alike. */
  readonly at: Date

  /**
   * Which controls this surface may draw, already decided by the page that read the credential.
   *
   * A {@link PlanControls} and never a role, a scope or a `PlanShareView`: the page asks
   * `planCapabilities` once — or passes `ADMIN_CONTROLS` — so nothing under here can re-derive a
   * permission from a credential-shaped value, and no token can reach the Flight payload through it.
   * Each answer is a rendering answer and never a gate; `lib/plan-capabilities.ts` holds that
   * argument in full.
   *
   * **Nothing below draws one yet.** This phase decides the answer and threads it; the drawer, the
   * conflict list and the share manager that spend it are the tasks after this one, and they mount
   * beside this screen as well as under it.
   */
  readonly controls: PlanControls
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
 * Its `plan` is a {@link PlanScreenModel} and not a `Plan`, which is the one place both surfaces'
 * guarantee about share tokens is spent. The admin page and `/s/<token>` each reduce the view their
 * read answered before anything sees it, and this prop is what makes that a **compile** error to skip
 * rather than a leak sweep away from shipping: a plan carrying `shareLinks` is not assignable here, so
 * no page can hand this subtree a token and no client component added inside it later can drag one
 * into the Flight payload (ADR 0033). The canvas and the table below take the **same** type, and no
 * longer a whole `Plan`: this screen is no longer the only surface a plan is rendered through, and a
 * narrowing that lives one level up reaches nothing mounted beside it.
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
 * `@repo/ui`'s vendored `components/tabs` is `'use client'` and wraps Radix's `Tabs`. Its
 * `TabsContent` computes `present = forceMount || isSelected` and then renders through `Presence`
 * with `hidden: !present` (`@radix-ui/react-tabs@1.1.21`), so the unselected panel is **either
 * unmounted or carries the `hidden` attribute** — one or the other, never both, and out of the
 * accessibility tree in each case. §5 does not itself forbid that; what §5 says is that "an SVG-only
 * plan is unreadable to a screen reader". The prohibition is **this file's inference** from it: if the
 * table is the only rendering a reader can read, a switch that takes it away leaves that reader with
 * a picture and a label. Two `<input type="radio">` and their labels express the same choice natively:
 * the browser owns the state, this whole screen stays a Server Component, and there is nothing to
 * hydrate.
 *
 * Both renderings are **always mounted**, and the asymmetry between them is deliberate. The canvas is
 * `display:none` when the table is chosen — it is one `role="img"` graphic, so hiding it costs a
 * screen reader one label. The table is never hidden: it is `sr-only` when the timeline is chosen,
 * which keeps every row in the accessibility tree while taking it off screen, so a reader is never
 * told to switch views to reach the only rendering it can read. The cost is that the table's markup is
 * always sent — 2,200 rows at this product's cap, which is what `plan-table.test.tsx` renders — and
 * that a reader hears both renderings at once. The second is the point rather than a defect.
 *
 * The controls and the two panels are **siblings under one flex parent**, because a `peer-*` variant is
 * a sibling selector: a wrapper around the radios for layout would break the only connection that
 * makes the switch work. That is also why the group is not a `<fieldset>` with a `<legend>` and why
 * nothing here claims `role="radiogroup"` — the only element containing both radios also contains both
 * panels, and calling that a radio group would be false. What the two radios get instead is a shared
 * `aria-describedby` pointing at one `sr-only` sentence, which says what the choice does without
 * asserting a structure that is not there. The radios and that sentence are `sr-only`, so they are out
 * of flow and cost the layout nothing, and each panel is `w-full`, so it takes a line of its own under
 * the two tabs.
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
        <p className="sr-only" id={HINT_ID}>
          {HINT}
        </p>
        <input
          aria-describedby={HINT_ID}
          className={TIMELINE_RADIO}
          defaultChecked
          id={TIMELINE_ID}
          name="plan-view"
          type="radio"
        />
        <label className={TIMELINE_TAB} htmlFor={TIMELINE_ID}>
          Timeline
        </label>
        <input
          aria-describedby={HINT_ID}
          className={TABLE_RADIO}
          id={TABLE_ID}
          name="plan-view"
          type="radio"
        />
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
