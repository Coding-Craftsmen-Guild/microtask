# ADR 0068 — A problem belongs to its entity, and the plan page is a frame

**Status:** Accepted · 2026-09-28

**Revises:** [ADR 0067](0067-the-plan-page-is-a-sidebar-a-graph-and-a-docked-drawer.md).
**Keeps whole:** [ADR 0057](0057-the-drawer-is-a-route.md), [ADR 0055](0055-canvas-geometry-is-its-own-pure-package.md), [ADR 0064](0064-a-group-is-a-plan-level-label-a-feature-points-at.md), [ADR 0040](0040-a-seat-page-authenticates-from-its-url.md).

## Context

ADR 0067 built the sidebar, the drawers and the three rungs, and the gate was green. Then somebody
opened the deployed page.

The report was two sentences and both were right:

> How this plan contradicts itself — I don't even want this to exist, if there's an issue with an
> entity, you mark an error on the item itself.

> Make the design more github like, azure devops boards, something that's clean and simple, yet
> powerful.

Measured on the deployed plan at 1600×1000, with the numbers taken from the page rather than from
memory:

**The timeline was 272px wide on a 1545px grid.** `PlanScreen` split with
`lg:grid-cols-[17rem_minmax(0,1fr)]` and the seat surface passed `sidebar={null}`. A null React child
renders nothing *at all* rather than an empty box, so the board became the **first** grid item and
drew itself into the 17rem names track, with the wide column beside it empty. Every test passed:
none rendered the seat surface at width, and `happy-dom` computes no layout.

**The graph began at y=2780 on a 3150px page.** Above it sat `ConflictList`, which printed about
thirty rows, each one twice — a sentence, then the same subject again as a link:

> Re-run migrate-plan on all three tenants has no estimate, so it was left off the timeline.
> Re-run migrate-plan on all three tenants

Most of those rows were *items*. An item is never a bar on the timeline; it is a tick under its
feature. "Left off the timeline" is not news about an item, and thirty repetitions of it was the
whole wall.

**The sidebar overflowed onto the canvas.** Rows used `flex-1 truncate` on the name. `flex-1` is
`flex: 1 1 0%` and does **not** set `min-width: 0`, so the item kept its automatic content minimum,
refused to shrink, and grew the row past its column. The per-row `Open` links landed on top of the
board at x≈415.

**No bar carried a label.** A feature was a `<rect>` with a `data-feature-id`. Nothing on the
timeline said what anything was.

## Decision

### 1. A problem is filed under the entity it is about

`components/plan/conflicts/` is deleted. `components/plan/attention/` answers a different question —
*what is wrong with this entity* — keyed by id:

```ts
export function attentionOf(plan: AttentionPlan): AttentionMap
```

Every field of `ScheduleResult` already names at least one entity id, so nothing is lost. The one
addition is a **rollup**: unsized items are counted onto the feature that owns them, so thirty rows
become four badges. The rolled-up items keep their own badge in their feature's drawer, which is the
one place a person can size them.

It shows in four places and as a sentence in none of them but the last: a dot on the sidebar row, one
tray row per unplaced **feature** under the board, a callout at the top of that entity's drawer, and
a count beside the plan's calendar.

The count counts **features**, not entities. Counting items too made the header say "19 need
attention" over a page showing four marks, because every unsized item counted once on its own account
and again inside its feature's rollup.

### 2. The page is an application frame

`PlanShell` is two fixed strips over two panes that scroll independently, inside a `flex h-dvh
flex-col` layout with `<AppBar width="wide">` and a new `<Page width="full">`. The timeline is on
screen at load whatever else the plan holds, and growing the plan makes a pane scroll rather than
pushing the plan off the bottom.

**Flex, not a two-column grid.** A missing sidebar is one fewer flex item and `flex-1` takes the
room. The grid's failure mode — silently drawing the board in the wrong track — is not available.

**`min-w-0` on every pane and every truncating child**, which is the whole fix for §Context's third
paragraph.

The whole-plan actions (New group, Settings, Share) move out of the sidebar and next to the plan's
name. Sharing a plan is not navigation, and three of them over a rail tree made the one action that
*is* about rails compete with three that are not.

### 3. Rail names leave the SVG

They are an HTML column beside the canvas; the quarter and week headings are an HTML row above it.
So `LAYOUT.chromeHeight` is `0`, `CANVAS_SCALE.gutter` is `0`, and `quarter-bands.tsx`,
`sprint-ticks.tsx` and `unplaced-features.tsx` are gone.

Three things follow that the gutter could not give: the names stay put while the board scrolls
sideways, they are links with counts and badges rather than `<text>`, and they truncate.

The per-sprint transparent hover rectangles went with the tick layer. They were one full-height
invisible pointer target per sprint lying over every bar on the canvas.

### 4. A bar carries its name

`barLabels` in `@repo/canvas` — pure geometry, because `happy-dom` answers every measurement with a
zero `DOMRect`. Inside the bar when it is wide enough, after it otherwise, truncated to the gap
before the next bar on that rail.

The gap is bounded by the next bar with **no fallback**. An earlier version treated a neighbour
starting at this bar's end as "nothing to measure against" and fell back to a 220px overhang — and
since features on a rail are scheduled back to back, that is the ordinary case, so every name in a
contiguous run was drawn at the same x on top of the others.

### 5. The axis follows the plan, and so does the opening zoom

`rangeFor` derives the day range from the plan's own span, floored at one pane's worth of days.
`openingZoom` then picks the finest scale the plan nearly fits, and `readZoom` returns `Rung | null`
so that "never chose one" and "chose the middle rung" stay distinguishable.

A fixed range is a fixed pixel width: 120 days at 14px is a 1680px canvas whatever the plan holds,
which is how a sixteen-day plan came to be drawn with its bars in the first ninety pixels of eleven
hundred. The zoom fixes the *scale*, which is what a person is choosing; the *extent* follows the
work.

### 6. The drawer is a dock

A scrim that closes it when clicked (an anchor, so it needs no JavaScript), a title bar with the
subject's kind and an `aria-label="Close"` control, and a body that scrolls. It had none of those: the
only way out was a text link below however many fields the subject had.

## Consequences

**The seat surface gets the tree.** It passed `null` before, which is what §Context's first paragraph
was. Both surfaces render the same sidebar; the seat's own capabilities decide what is on it, and
`DrawerRoutes` gained `rail: ((root, id) => string) | null` — null there, because that surface has no
rail drawer to open.

**Two lists name the rails**: the sidebar tree and the board's names column. They answer different
questions — navigate and search, against which row is which — and this is what Jira Plans and Azure
DevOps both do. The alternative worth considering later is one row per *feature* rather than per rail,
which would let the two become one column; that is a change to the rail model in `@repo/canvas` and
not to this page.

**Zoom on the seat surface is still the plan's own fit and not a control.** The canvas is in a layout,
a layout is not given `searchParams`, and a seat page may read no cookie (ADR 0040) — the guard that
keeps that true mocks `next/headers` to throw, and it was not weakened. §5 makes the default right for
whatever the plan is, which is most of what the seat was suffering from. Restoring the control there
means a rung path segment above the drawer.

**A test suite that passed while the page was broken** is the thing to carry forward. Every defect in
§Context was invisible to 1,680 passing tests, because `happy-dom` computes no layout and no test
rendered the seat surface at a width. The tests that would have caught them are the ones that assert
*structure* — which pane a child lands in, whether a slot can be null — and those have been added.
What still cannot be tested here is how it looks, and the answer to that is to open it.
