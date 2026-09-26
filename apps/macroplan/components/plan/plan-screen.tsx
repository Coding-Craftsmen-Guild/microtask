import type { PlanBridge } from '@repo/api-client'
import type { ReactNode } from 'react'
import type { PlanControls } from '../../lib/plan-capabilities'
import { PlanCanvas } from './canvas/plan-canvas'
import { PlanHeading } from './plan-heading'
import type { PlanEditActions } from './edit-actions'
import type { PlanScreenModel } from './plan-screen-model'
import { PlanTable } from './table/plan-table'
import { VIEW_SWITCH } from './view-switch'

const HINT = 'Choose which rendering of this plan is on screen. The table stays readable either way.'

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
   * **One answer is now spent here**, and it is `content.placeFeature`: with it and
   * {@link PlanScreenProps.actions} together the canvas listens for a drag, and without either it draws the
   * same timeline and listens for nothing (`canvas/drag-root.tsx`). That is a rendering answer and not a
   * gate — the API is asked again at the instant of the drop — and it is the first of these this screen has
   * read. The table below still draws no control, and the drawer that does is filled from the route rather
   * than from here: a drawer page asks for its own `ADMIN_CONTROLS.content` because a layout cannot hand
   * its children a prop, so the slot's controls do not arrive through this one. The conflict list that fills
   * {@link PlanScreenProps.conflicts} draws no control either — every link it draws is a navigation —
   * and it is handed no `PlanControls` at all: what decides whether it is drawn is which surface is
   * rendering rather than what the caller may do.
   *
   * **`seats` is spent nowhere under here**, and that is the decision {@link PlanScreenProps.share}
   * argues: the share manager is a *slot*, so the four seat answers are spread into the flat booleans of
   * `components/plan/share/share-manager.tsx` by the page that also hands it the matching actions. This
   * component neither reads them nor could: a surface's controls and its credential have to agree, and
   * only the page holds both.
   */
  readonly controls: PlanControls

  /**
   * Every write of plan content, or `null` on a surface that hands none over.
   *
   * One member of it reaches a component from here — `placeFeature`, which the canvas's drag sends — and
   * the rest are handed to the drawer by the route that fills {@link PlanScreenProps.drawer}, a layout
   * being unable to pass its children a prop. Which of the two decides whether the drag is drawn is
   * {@link PlanScreenProps.controls}: the object is the writes, the controls are the drawing answer, and
   * the API is the gate (`lib/plan-capabilities.ts`).
   *
   * `null` today is `/s/<token>`, and the reason is specific rather than a tier: a seat's writes are bound
   * to its token (`components/plan/seat-actions.ts`), and `app/s/[token]/page.test.tsx` asserts that this
   * surface hands over **no function at all** — a stated known gap, since its leak sweep cannot read a
   * bound function's arguments. Mounting them is the task that widens that sweep; until then a seat holding
   * `manage` reorders from the drawer's own controls rather than by dragging, and this prop is required so
   * that `actions={null}` is a sentence somebody wrote rather than a prop nobody passed.
   */
  readonly actions: PlanEditActions | null

  /**
   * The plan's own contradictions, or `null` on a surface that cannot link to the controls that fix
   * them.
   *
   * A **slot** and not a `<ConflictList>` mounted in here, and the reason is not layout: every link a
   * conflict row draws is an **admin** drawer path (`lib/drawer-routes.ts`), and this screen is
   * rendered by `/s/<token>` as well as by `/plans/[planId]`. A seat holder following one would be
   * sent to `/login?next=…` for a password they do not have (ADR 0032), so *which surface is
   * rendering* is what decides whether the list may be drawn — and that is not a question a component
   * under here can answer. A slot makes the answer the page's, as {@link PlanScreenProps.drawer}
   * does, and for the same reason it is **required** rather than optional: on the day the seat
   * surface gains the drawer routes `lib/drawer-routes.ts` is holding two builders back for, the one
   * `conflicts={null}` on that page is a line somebody has to revisit rather than a screen that goes
   * on rendering without a list it now has links for.
   *
   * It is **not** the drawer slot and could not be: a drawer is the one subject that is open and is
   * filled from the route, where this is about the whole plan and stays put while the route moves. It
   * sits with the plan's name and settings line, **above** the drawer, because it is a fact about the
   * plan in the same way those two are, and because a list of links to the drawer reads oddly below
   * the drawer one of them has just opened. Both are above the view switch, and that constraint is
   * the drawer's own: the table below is always mounted and 2,200 rows tall at this product's cap, so
   * anything after it is thousands of rows from the plan's name — which is also why this list cannot
   * be a sibling *after* this whole component, and so why the page does not simply render it beside
   * this one.
   *
   * `null` renders nothing at all, and the list itself answers `null` for a plan that contradicts
   * itself in none of the three ways, so an admin plan with nothing wrong adds no markup here either.
   */
  readonly conflicts: ReactNode

  /**
   * Whatever is open beside the plan: one feature, one item, or the sentence saying nothing is.
   *
   * A **slot** and not a component, because what fills it is a route. `/plans/[planId]/layout.tsx`
   * renders this screen and passes its own `children` through, so opening a feature is one soft
   * navigation that re-renders the drawer and leaves the canvas and the table exactly as they are — a
   * layout does not re-render when navigation moves between its children. A `<PlanDrawer>` mounted
   * inside here instead would put the selection back into this subtree's render, which is the cost
   * the route was chosen to avoid.
   *
   * It sits **above** the view switch rather than below both panels, and that is about the table:
   * it is always mounted and 2,200 rows tall at this product's cap, so a slot after it would open a
   * drawer thousands of rows below the plan's name.
   *
   * **Required, and `null` on a surface with no drawer** — which today is `/s/<token>`, whose own
   * twins of those two segments are a later task. Required and not optional for the reason
   * `TableRow.item` gives one directory over, where a feature row's item cell is `null` and "not `''`
   * and not a dash — because the cell is then about nothing rather than about something empty, and
   * only one of the two is a fact a test can assert". The same holds of a whole slot: `drawer={null}`
   * makes "this surface has no drawer" a sentence the seat page states, where an omitted prop is a
   * question nobody asked — and it makes that page a compile error the day it gains drawer routes
   * rather than a screen that quietly goes on rendering without one.
   *
   * `null` renders nothing at all rather than an empty container: a collapsed panel with no content is
   * markup nobody reads, and the admin surface's empty state is a page that says something instead.
   */
  readonly drawer: ReactNode

  /**
   * Who else may open this plan: the share manager, or `null` on a surface that administers no seats.
   *
   * A **slot** for the reason {@link PlanScreenProps.conflicts} is one, arrived at from the other
   * direction. The conflict list cannot be mounted here because *which surface is rendering* decides
   * whether its links are reachable; the manager cannot be mounted here because which surface is
   * rendering decides **whose credential its four actions carry**. An admin's are Server Actions reading
   * `mp_admin` (`actions/plan-share-links.ts`); a `manage` seat's would have to carry that seat's token,
   * which is the whole of its authority (ADR 0040) — and a component under here cannot choose between
   * them without being handed a role, a token or a principal, none of which may cross into a client
   * (ADR 0033, ADR 0038). So the page that read the credential builds the element, exactly as it decides
   * the controls, and this screen places it.
   *
   * The controls are therefore spent by that page too: `share-manager.tsx` takes the four `share:*`
   * booleans as four flat props because `module-boundaries.test.tsx` admits nothing but primitives and
   * unbound functions across a client boundary, which is the same rule that stops a seat list from ever
   * arriving as a prop. The seats it shows are fetched by the action **after** it is open.
   *
   * It sits in the **heading row** rather than in the grid below it: sharing is a fact about the plan in
   * the way its name and its settings line are, and the button belongs beside them rather than above a
   * drawer or below 2,200 rows of table. So a filled slot adds no row to the grid — `plan-screen.test.tsx`
   * asserts that, which is what keeps the two slots below it the only things the grid grows by.
   *
   * **Required, and `null` on `/s/<token>`** — which is the same sentence `actions={null}` says there and
   * for the same unfinished reason rather than a tier: a plan-scoped `manage` seat may legitimately
   * administer its plan's seats (ADR 0038, and `planCapabilities` answers all four `true` for it), but its
   * actions must be bound to its token, and `app/s/[token]/page.test.tsx` asserts that surface hands over
   * **no function at all** because its leak sweep cannot read a bound function's arguments — the same gap
   * `module-boundaries.test.tsx` closes by refusing any `bound `-prefixed function. Mounting a seat's
   * manager is therefore the task that widens that sweep, and `share={null}` is what makes that a line
   * somebody edits rather than a surface quietly missing a control its holder may use.
   */
  readonly share: ReactNode

  /**
   * What this plan's rails are bound to in Microtask: the bindings panel, or `null`.
   *
   * The inward half of §7's two links, beside the outward one. That section opens by warning that "two
   * different things in this product are called a link, they point in opposite directions, and confusing
   * them is the fastest way to build a credential leak" — {@link PlanScreenProps.share} hands a link
   * **out** so somebody can see this plan, and this holds the credentials held **inward** so this plan
   * can read Microtask. They sit beside each other because both are plan-wide administration rather
   * than anything about a selection, and because putting them together is what makes the distinction
   * visible to whoever is doing it.
   *
   * A **slot** for the reason the other three are: `epic:bind` is admin-only, so what fills this is a
   * decision only the page that read the credential can make. `null` on `/s/<token>` — and there, unlike
   * the other two, it is `null` **by policy rather than by an unfinished sweep**: no seat of any role
   * holds `epic:bind`, so a seat surface has nothing to draw here and never will until that grant
   * changes. That is worth stating, because the day somebody mounts the seat surface's share manager
   * they must not reach for this one as well.
   */
  readonly bridge: ReactNode

  /**
   * The forms that name this plan's groups, recolour them and delete them — or `null`.
   *
   * **The chips that select a group are not in this slot**, and the split is the correction worth reading
   * before filling it. Selecting a group writes nothing, so it needs no credential and cannot be a page’s
   * decision; it is mounted from `plan.labels` by `PlanHeading`, the way the table and the canvas are
   * mounted from the same plan. Putting both halves in one slot made the whole feature admin-only by
   * accident, because this slot is `null` on `/s/<token>` — a seat holder was shown a `Group` column naming
   * phases in the table with no way to select one.
   *
   * So what is left here is administration, and it is a **slot** for the reason the other four are: what
   * fills it is a decision only the page that read the credential can make. `null` on `/s/<token>` for the
   * same unfinished reason `actions={null}` is null there, and not by policy: a plan-scoped `manage` seat
   * holds all four group writes, so that surface *should* draw them — what stops it is that its writes must
   * be bound to its token, and `page.test.tsx` asserts it hands over no function at all.
   */
  readonly groups: ReactNode

  /**
 * The forms that name this plan's rails, recolour them, reorder them, delete them and put a feature
   * on one — or `null` on a surface that edits no rail.
   *
   * **The slot a plan is entered through.** A feature names the rail it sits on, and every other write
   * in this product is addressed at a feature or an item under one, so before this existed a plan held
   * nothing and could never come to: the drawer that creates a feature can only be opened on a subject
   * that already exists. `components/plan/rails/rails-panel.tsx` carries that argument in full.
   *
   * A **slot** for the reason the three beside it are: what fills it is five actions plus a sixth that
   * creates a feature, and whose credential each carries is the page's decision rather than this
   * component's. It joins them in the heading row, which now holds four — the most a heading can carry
   * before the page needs a different shape, and the point at which the grid below is what gives way
   * next rather than another manager.
   */
  readonly rails: ReactNode

  /**
   * What each linked item's task counts, as the bridge answered it — `[]` when nothing is linked.
   *
   * **Data and not a slot**, unlike the four above, and the difference is who renders it: a manager is a
   * self-contained thing a page builds, where these numbers are read by the table's seventh column and by
   * the canvas's bars. Handing those a slot would mean the page building 2,000 cells.
   *
   * `[]` rather than optional, and `[]` for three different reasons that a reader must not need to tell
   * apart: nothing on this plan is linked, the bridge request did not land (`read-bridge.ts` collapses
   * every failure to `null`), or this surface does not read the bridge at all. All three mean the same
   * thing on screen — no counted number, so no progress — which is exactly what design §7.2 requires:
   * "an unlinked item has a manual status only — not a manual percentage — so a number on screen is
   * always a counted number". An empty array is that sentence, and an optional prop would have invited a
   * fourth rendering for "not asked".
   *
   * It carries **no task name**, and could not: the row type's `taskName` is absent for any reader below
   * an effective `write`, decided by the API and not here. So passing this array on is safe in a way a
   * plan carrying `shareLinks` never was, and neither the table nor the canvas has a decision to make.
   */
  readonly progress: PlanBridge['items']
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
 *
 * That sibling requirement is why what moved out of this file is `VIEW_SWITCH` — ten strings in
 * `./view-switch` — and **not** a `<ViewSwitch>` component. The markup of the radios, their labels and
 * both panels has to stay one flat list of siblings here; a component drawn around any part of it is
 * the wrapper the paragraph above rules out. The strings are the part of the switch that can leave, and
 * `view-switch.ts` says why each of them is coupled to the others.
 *
 * ### Where this file divides next
 *
 * The heading row has **been** lifted, into `./plan-heading.tsx`, which is what made room for the fourth
 * slot {@link PlanScreenProps.bridge} adds — the split this paragraph used to ask for. **Measure the
 * count rather than trusting a number written here**: the figure in this block has been stale twice, once
 * by three lines and once by a whole split, and `npx eslint components/plan/plan-screen.tsx` from inside
 * the app is the only reading that is not a guess.
 *
 * What remains is the grid, the four slots and the switch, and **the switch cannot be divided at all**.
 * The paragraphs above rule out everything inside `VIEW_SWITCH.views`: the radios, their labels and both
 * panels are peers of one another by necessity, and a component drawn around any of them breaks the
 * sibling selector the whole switch is built on. So the next thing to give way, if a fifth slot ever
 * arrives, is the **grid wrapper and the slot order** — `./plan-body.tsx` taking the three `ReactNode`s
 * and the two panels — and not another piece of the switch. A fifth slot is also a question before it is
 * a refactor: four managers and lists above one timeline is already the most a heading can carry before
 * the page needs a different shape.
 */
export function PlanScreen(props: PlanScreenProps) {
  const { plan, at, actions, bridge, controls, conflicts, drawer, groups, progress, share } = props
  const { rails } = props
  const place = actions !== null && controls.content.placeFeature ? actions.placeFeature : null
  return (
    <div className="grid gap-4 pt-6" data-slot="plan-root">
      <PlanHeading managers={<>{share}{bridge}{rails}{groups}</>} plan={plan} />
      {conflicts}
      {drawer}
      <div className={VIEW_SWITCH.views}>
        <p className="sr-only" id={VIEW_SWITCH.hintId}>
          {HINT}
        </p>
        <input
          aria-describedby={VIEW_SWITCH.hintId}
          className={VIEW_SWITCH.timelineRadio}
          defaultChecked
          id={VIEW_SWITCH.timelineId}
          name="plan-view"
          type="radio"
        />
        <label className={VIEW_SWITCH.timelineTab} htmlFor={VIEW_SWITCH.timelineId}>
          Timeline
        </label>
        <input
          aria-describedby={VIEW_SWITCH.hintId}
          className={VIEW_SWITCH.tableRadio}
          id={VIEW_SWITCH.tableId}
          name="plan-view"
          type="radio"
        />
        <label className={VIEW_SWITCH.tableTab} htmlFor={VIEW_SWITCH.tableId}>
          Table
        </label>
        <div className={VIEW_SWITCH.scroller}>
          <PlanCanvas at={at} place={place} plan={plan} progress={progress} />
        </div>
        <div className={VIEW_SWITCH.tablePanel}>
          <PlanTable plan={plan} progress={progress} />
        </div>
      </div>
    </div>
  )
}
