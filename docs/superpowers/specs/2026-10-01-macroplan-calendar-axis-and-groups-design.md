# Macroplan: a calendar axis, quiet arcs, and groups that actually select

Nine instructions arrived from the product owner against the deployed plan page, with screenshots.
They are not one change. This spec covers the first three, which are the two the screenshots point a
camera at plus the one that turns out to be a defect rather than a request:

1. the timeline does not reach the right edge of its pane, and its quarters are numbered `Q1…Q5`
   from nothing a reader recognises;
2. the dependency arcs end in arrowheads nobody wants, and are painted in a hue that says nothing;
3. choosing a group greys out almost nothing, there is no way to see or edit what is in one, and the
   control to make one is not where the groups are.

The remaining six — scroll-to-zoom, click-to-drill, hover cards, rail dropdowns, rail-to-timeline
hover, and a full data table — are named in §6 and are each their own spec.

## 1. What is actually wrong

### 1.1 `Q5` is a count of sprints, not a quarter

`SPRINTS_PER_QUARTER` is 6 and `quarterBands` labels band *n* as `Q${n + 1}`, counting from the plan's
own first working day. `packages/canvas/src/bands.ts` is explicit that this is deliberate — "a
'quarter' here is **a fixed count of sprints counted from the plan's own `startDate`**, not a real
calendar quarter" — and argues it on two properties: every band edge falls on a sprint boundary, and
every band is the same width at a given scale.

Both properties are real and neither is worth what they cost. A plan starting 2026-09-28 draws `Q1`
over October 2026 and runs to `Q5`, and there is no year in which `Q5` is a quarter of anything. The
band is chrome whose entire job is to tell a reader *when*, and it is the one element on the page
that answers in a private unit.

The week row beneath it has the same disease and the same cause. `labelOf` counts weeks from the
plan's first week, so `W1–2` sits under what is really Q4 2026, and the two rows of one header
disagree about what calendar they are on.

### 1.2 The canvas is 1040px wide in a 1380px pane

`rangeFor` floors the axis at `onePane = ceil(paneWidth / pxPerDay)`, and `paneWidth` comes from
`PANE_WIDTH = 1040` in `components/plan/canvas/zoom-view.ts` — a constant, because the server cannot
measure a pane. At the Year stop that is 260 working days at 4px, so the canvas is exactly 1040px and
everything right of it is bare background.

The obvious fix is the wrong one. Giving the `<svg>` `width:100%` while it carries a `viewBox` scales
**both** axes: rail bands grow taller than the HTML name rows beside them, every `<circle>` becomes an
ellipse under `preserveAspectRatio="none"`, and every bar label stretches. The canvas holds `<rect>`,
`<circle>`, `<polygon>`, `<line>`, `<path>` and `<text>`, and only the first and the fourth survive a
non-uniform scale.

### 1.3 Arcs end in arrowheads and are painted by a taxonomy

`ArcLayer` emits three `<marker>` definitions and every path carries `markerEnd`. `arc-kinds.ts`
paints by `ArcKind`: `same` is `stroke-muted-foreground/40`, `cross` is `stroke-muted-foreground`,
`ignored` is `stroke-destructive` and dashed.

So an arc's colour tells a reader whether its two ends happen to be on one rail — which they can see
— and tells them nothing about *which* work is coupled, which they cannot. On a plan with four rails
every arc is the same grey, and the thread the eye wants to follow is unfollowable.

### 1.4 Choosing a group dims the wrong set, which is nearly none of it

`groupCss` generates, per group:

```css
[data-slot="plan-root"]:has(#mp-group-<id>:checked)
  [data-label-id]:not([data-label-id="<id>"]) { opacity: 0.32 }
```

A feature in **no** group renders `data-label-id={labelId ?? undefined}`, so the attribute is
*absent*, so `[data-label-id]` does not match it, so it is not dimmed. The rule only quiets features
that are in some *other* group. On a plan where most features are ungrouped — which is every new plan
— selecting a group visibly changes nothing, which is exactly what the screenshot shows.

Bar labels and arcs carry no `data-label-id` at all, so even where the rule bites, the feature's name
stays bright over its own dimmed bar.

### 1.5 There is no way to see what is in a group

`/plans/<id>/g/<labelId>` renames, recolours and deletes. It states a count and no members, and ADR
0064 argues the omission: "a group with a list of members here would be a second place to write the
same pointer, and the two could disagree." Meanwhile the only way to reach that drawer at all is a
route nothing links to — the chips are `<label>`s for radios, and a `<label>` cannot also be a link.

And `New group` sits in the page head next to `Share` and `Settings`, three regions away from the
groups it makes.

## 2. The axis becomes a calendar

### 2.1 `calendarBands` replaces `quarterBands`

New pure geometry in `@repo/canvas`, beside the function it replaces:

```ts
export interface CalendarBand {
  readonly year: number
  readonly quarter: 1 | 2 | 3 | 4
  readonly label: string      // `Q4 2026`
  readonly startDay: number
  readonly endDay: number     // exclusive, as every endDay in this package is
  readonly x: number
  readonly width: number
}

export function calendarBands(
  plan: PlanCalendar,
  scale: PlanScale,
  range: DayRange,
): readonly CalendarBand[]
```

Each working-day offset in the range maps to a date through `dayToDate` — already exported from
`@repo/schedule` — and a date names exactly one `(year, quarter)`. A band is a maximal contiguous run
of offsets sharing one, so bands abut exactly with no `+ 1` anywhere, matching `FeatureBar` and the
function being replaced.

Two properties §1.1 named are given up on purpose. A band edge no longer falls on a sprint boundary,
because a calendar quarter does not care where a sprint ends; the week ticks are a separate row and
are not cut by a band edge, so nothing is drawn through a label. And bands are no longer equal width,
because quarters hold different numbers of working days — which is a true statement about the
calendar and was previously being hidden.

`quarterBands` and `SPRINTS_PER_QUARTER` are deleted rather than kept beside it. Two functions
answering "which quarter is this" is the drift this repo removes on sight, and nothing else calls it.

### 2.2 Week ticks become ISO weeks

`sprintTicks` keeps its geometry — sprint boundaries are what bars snap to and what the grid should
draw — and changes only its label, from weeks counted off the plan to the ISO week numbers its two
dates fall in. A new pure `isoWeek(date: string): { year: number; week: number }` goes in
`@repo/schedule/calendar.ts`, beside `dateToDay` and `isWorkingDay`.

A tick labels `W40–41` when its first and last working days fall in different ISO weeks and `W40` when
they fall in one, which is the same first-equals-last rule `labelOf` already has. A sprint spanning a
year boundary labels from both weeks' own numbers; ISO week 1 is the week holding the first Thursday
of a year, so `W52–1` is a real and correct label and is not special-cased.

The `from`/`to` dates on `SprintTick` are untouched and stay hover-only, so `sprintHover` needs no
change. Spec §5's "no calendar date is ever in the label" still holds: a week number is not a date.

### 2.3 The canvas drops its `viewBox`

`viewBoxOf` is deleted and `CanvasLayout.viewBox` with it. The `<svg>` keeps `width` and `height` as
presentation attributes and gains `className="block w-full"` with `style={{ minWidth: width }}`.

With no `viewBox` an SVG's user units **are** CSS pixels, with no scaling transform of any kind. So
the element fills its pane, nothing stretches, and the SVG clips its own content to its own box — the
behaviour §1.2's `viewBox` route could not have at any `preserveAspectRatio`. `min-width` is an inline
style and not a class because the number is a runtime value and Tailwind's scanner reads classes as
text.

The pane being wider than the range then leaves bare grid, so the chrome is **bled** past
`range.toDay`:

```ts
export const BLEED_DAYS = 120
```

in `components/plan/canvas/view.ts`, beside the other numbers this screen chose, and not in
`@repo/canvas` — how far past its range a canvas paints is a fact about this pane, not arithmetic over
a plan.

`SprintGrid` and `TimeHeader` are drawn for `{ ...range, toDay: range.toDay + BLEED_DAYS }` while
every *mark* is drawn for the range itself. 120 working days is a quarter at the Item stop's 42px
(5,040px of bleed) and half a year at the Epic stop's 4px, so the grid reaches the edge of any pane a
browser can present, and the cost is at most twelve extra `<line>`s and a handful of `<rect>`s that
the SVG viewport clips. The HTML header clips them with `overflow-hidden`, which `TIME.quarterRow`
and `TIME.weekRow` need adding.

Nothing is bled on the left: day zero is the plan's first day and there is no axis before it.

### 2.4 Dropping the `viewBox` deletes the drag's one untestable line

`userScale(viewBoxWidth, renderedWidth)` exists to convert client pixels into user units, and ADR
0058 records the measurement that feeds it as "the one line no test in this repository can cover" —
`canvas.getBoundingClientRect().width`, untestable because `happy-dom` answers every
`getBoundingClientRect` with a zero `DOMRect`.

With no `viewBox` there is no conversion to do. A client pixel **is** a user unit, unconditionally,
so:

- `userScale` is deleted;
- `Origin.factor` is deleted, and `travelledBy` subtracts coordinates with no multiply;
- `originAt` loses its `renderedWidth` parameter and the `getBoundingClientRect` call in `DragRoot`
  goes with it;
- `CanvasBox.viewBox` is deleted, and `DragGhost`'s overlay `<svg>` takes `width:100%` and the
  canvas's `height`, so a bar dragged into the bled region is not clipped by a ghost narrower than
  the canvas under it.

This is recorded as an amendment to ADR 0058 rather than a new ADR: its decision — one delegation
root, resolving by `closest()` over server-rendered markup — is unchanged, and what goes away is the
caveat it apologised for.

## 3. Arcs lose their heads and gain their track's hue

`ARROW_POINTS`, `ARROW_SIZE`, `ARROW_FILL`, `arrowMarkerId`, the `<defs>` and every `markerEnd` are
deleted. Direction is already carried by the curve: `arcLayout` draws from the end of the depended-on
feature to the start of the waiting one, and both ends land on marks a reader can see.

Each arc strokes in **its source feature's rail colour**, as an inline `style`, exactly as `hueStyle`
already paints a bar. The join is in `arc-view.ts` and not in `@repo/canvas`: a colour is not
geometry, and ADR 0055 keeps that package free of anything this screen chose.

```ts
export interface CanvasArc extends DependencyArc {
  /** The rail colour of the feature this arc leaves, or `null` for a rail no epic claims. */
  readonly colour: string | null
}
```

`ARC_CLASS` keeps three entries and they now vary only in weight and dash:

| kind | stroke | why |
| --- | --- | --- |
| `same` | `stroke-1`, `[stroke-opacity:0.4]` | rail order already implies it; it is a restatement |
| `cross` | `stroke-[1.5]` | the only reason two lanes are coupled |
| `ignored` | `stroke-[1.5]`, dashed | a defect, said in shape rather than in hue |

`same` is quieted with `stroke-opacity` and **not** with `opacity`, which is what it uses today via
`stroke-muted-foreground/40`. §4.1's dimming rule sets element `opacity`, so a class doing the same
would be overridden outright rather than compounded, and a `same` arc outside the chosen group would
come back *brighter* than it is at rest. Stroke alpha and element alpha are separate channels and
multiply, which is the behaviour both effects assume.

`ignored` loses `stroke-destructive`. Hue now means "which track", and spec §5's rule that hue cannot
carry two meanings is the same rule that made it red in the first place — applied to the new
assignment, it takes the red away. A dropped edge is still the only dashed thing on the canvas, and
the table still says `set aside to keep rail order` in words, which is what a reader who cannot
distinguish a dash actually has.

An arc whose source rail has no colour falls back to `stroke-muted-foreground`, which is the class it
carries today.

## 4. Groups

### 4.1 The dimming selects by slot, not by attribute

`groupCss` emits one rule per group naming every kind of mark, so a feature in no group is dimmed by
the same rule that dims a feature in another one:

```css
[data-slot="plan-root"]:has(#mp-group-<id>:checked) :is(
  [data-slot="feature-bar"],
  [data-slot="item-mark"],
  [data-slot="bar-label"],
  [data-slot="arc"],
  [data-slot="plan-table-row"]
):not([data-label-id="<id>"]) { opacity: 0.32 }
```

`BarLabelText` and the arc paths gain `data-label-id`, which neither carries today. An arc takes the
label of its **source** feature, matching the hue §3 gives it: an arc leaving a chosen group's feature
stays lit, which is what makes "what does this phase block" readable.

`isStyleSafeId` still guards every interpolation and `0.32` stays `DIMMED_OPACITY`, shared with
`SELECT_DIMMED` in `select-css.ts`.

### 4.2 A grouped feature is drawn in its group's colour

ADR 0064 fixed a group's colour as "a swatch and never a fill", on spec §5's rule that an epic owns
hue. The product owner has reassigned the channel. The new rule is one line and keeps hue single-valued:

> A feature's hue is its **group's** colour, or its **rail's** colour when it is in no group.

`canvasLayout` already builds `groupsOf(plan)`, a feature-to-label map, so the join costs one lookup
per bar. `RailFrame` gains `hues: ReadonlyMap<string, string>` — label id to `#rrggbb` — and
`FeatureBarMark`, `FeatureNode` and `ItemMarkShape` take the feature's group colour where one exists
and the rail's where one does not. `treatmentsOf` is untouched: treatment is still the second channel
and still says how the work is going.

Rail colour keeps the two places it was already the only thing speaking — the sidebar tree's swatch
and the rail-names column's chip — so a reader can still tell which lane is which, by position and by
the chip at the head of it.

This amends ADR 0064. The amendment states what it costs: on a plan where every feature is in some
group, the canvas stops showing rail membership in hue at all, and the lane is carried by the band
alone.

### 4.3 The chip row gains a double-click and a `+ New group` pill

`GroupChips` is wrapped by one client delegation root, `GroupChipRoot`, following ADR 0058's pattern
exactly: it is handed the server's markup on `children` and nothing else, resolves the chip by
`event.target.closest('[data-slot="group-chip"]')`, reads `data-label-id` off it, and pushes
`/plans/<planId>/g/<labelId>` on `dblclick`. It takes `planId` as a string, which the boundary sweep
admits.

Single click is untouched and still checks the radio, because the `<label>` is untouched. A
double-click fires two `click`s first, so the radio ends up checked and the drawer opens over the
selection it just made — which is the right outcome and not a thing to suppress.

The row ends with a `+ New group` pill: a `<Link>` to `/plans/<planId>/new/group`, styled as the chips
are but dashed, rendered only where `controls.content.createLabel` allows it. The head's existing
`New group` button is removed, because two controls for one thing is the thing this revision keeps
deleting.

### 4.4 The group drawer lists and edits its members

`/plans/<planId>/g/<labelId>` gains, under the name and colour fields, every feature of the plan as a
checkbox — checked for the ones in this group — grouped under its rail's name so a reader can see the
cut across rails that is the whole point of a group.

Each toggle calls the existing `feature:label` action: checking sets the feature's `labelId` to this
group, unchecking sets it to `null`. That is the same single write path ADR 0064 insisted on — a
feature still points at a label, and nothing points back — invoked from a second place. The ADR's
actual fear, two records disagreeing, is unreachable because there is still only one record: the
feature's own field.

The amendment to ADR 0064 records this as a narrowing of its "what this costs" section rather than a
reversal of its decision.

## 5. What this touches

| file | change |
| --- | --- |
| `packages/schedule/src/calendar.ts` | `isoWeek` added |
| `packages/canvas/src/bands.ts` | `calendarBands` replaces `quarterBands`; `sprintTicks` relabels |
| `packages/canvas/src/index.ts` | export swap |
| `components/plan/canvas/view.ts` | `viewBoxOf` deleted; `RailFrame.hues` added |
| `components/plan/canvas/plan-canvas.tsx` | no `viewBox`; `w-full` + `minWidth`; bled chrome |
| `components/plan/canvas/sprint-grid.tsx` | `calendarBands`; bleed |
| `components/plan/canvas/selection.ts` | `userScale`, `Origin.factor`, `CanvasBox.viewBox` deleted |
| `components/plan/canvas/drag-root.tsx` | measurement deleted |
| `components/plan/canvas/drag-ghost.tsx` | no `viewBox`; full-width overlay |
| `components/plan/canvas/arc-kinds.ts` | markers deleted; `ignored` loses its hue |
| `components/plan/canvas/arc-layer.tsx` | no `<defs>`; per-arc stroke; `data-label-id` |
| `components/plan/canvas/arc-view.ts` | `CanvasArc` joins rail colour |
| `components/plan/canvas/bar-label.tsx` | `data-label-id` |
| `components/plan/canvas/feature-bar.tsx`, `feature-node.tsx`, `item-mark.tsx` | group hue first |
| `components/plan/board/time-header.tsx`, `board-css.ts` | calendar bands; bleed; `overflow-hidden` |
| `components/plan/labels/group-css.ts` | dim by slot |
| `components/plan/labels/group-chips.tsx` | `+ New group` pill |
| `components/plan/labels/group-chip-root.tsx` | **new**, one client file |
| `app/(admin)/plans/[planId]/g/[labelId]/page.tsx` | membership list |
| `components/plan/shell/plan-manage.tsx`, `app/(admin)/plans/[planId]/admin-slots.tsx` | `New group` and its `mayAddGroup` prop removed |
| `docs/adr/0058`, `docs/adr/0064` | amended |

`module-boundaries.test.tsx` holds its client-file allowlist as an exact assertion in both directions,
so `group-chip-root.tsx` must be added to it — the test fails until it is, which is the point.

## 6. Out of scope

Each of these is its own spec, in this order:

- **Pointer interaction** — scroll-to-zoom, click-a-mark-to-drill, hover detail cards, and
  rail-sidebar hover driving the timeline. Zoom is a server action and a cookie today; all four want
  a client interaction layer over the canvas, and that layer is one decision, not four.
- **The data table** — search, sort, column visibility and reorder, and row-level add/edit/delete.
- **Rail rows as dropdowns** in the sidebar.

Also out of scope here: any change to `@repo/schedule`'s forward pass. No bar moves because of
anything in this spec.

## 7. As built, four things differ from the above

Written after the work, because each was found by opening the page rather than by reasoning about it.

**The selection sheets anchored on an element that did not exist.** §4.1 treats the dimming rule's
`:not()` as the whole defect. It was half of it. Both generated sheets — `labels/group-css.ts` and
`sidebar/select-css.ts` — opened every rule with `[data-slot="plan-root"]`, and nothing has rendered
that slot since the frame of ADR 0068 replaced the old root with `plan-shell`. So no rule in either
sheet could match, and the sidebar's rail and feature selection had never dimmed anything either.

Nothing failed, and the reason is worth keeping: each sheet's tests assert the rule's **text**, the
marks' tests assert the **attributes** those rules name, and no test joined the two. A selector that
matches nothing is valid CSS. The anchor is now one exported constant, `shell/shell-css.ts`'s
`PLAN_ROOT`, and `plan-screen.test.tsx` holds the join — the anchor must be an element the screen
renders *and* an ancestor of the radios and the marks.

**The first band can open before day zero, so the header clamps the cell.** A calendar quarter does
not care when a plan started: a plan opening 2026-09-28 sits in a Q3 2026 that began on 2026-07-01,
sixty working days earlier. `calendarBands` returns that band whole, as it must, so its `x` is
negative — `time-header.tsx`'s `cellOf` floors the cell's `left` at the axis origin and takes exactly
those pixels off its width.

**Two more header faults followed from that and are fixed with it.** Each cell now clips to its own
band, because a four-pixel sliver of Q3 2026 was printing its name on top of Q4 2026's; and a band
narrower than `NAMEABLE` draws its cell and **no** text, because clipping alone left a lone `Q` in the
corner that reads as a rendering fault. The week cells clip but still wrap to two lines, which is what
lets `W40–41` fit a 40px column at the Year stop.

**`FEATURE_RUNG_MAX_DAYS` keeps 60 and stops pretending to be derived.** §2.1 deletes
`SPRINTS_PER_QUARTER`, which that bound was computed from. A calendar quarter is 62 to 66 working days
depending on which one and which year, so no constant equals it, and `rungFor` is handed a `DayRange`
with no calendar and could not know which quarter a viewport is over in any case. The bound is now
openly an approximation of a quarter rather than a restatement of one — the same limit
`ITEM_RUNG_MAX_DAYS` already lives with.
