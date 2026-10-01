# The year view, a group that fits the screen, and a sidebar you can add to

Four changes the product owner asked for after opening the plan board at Year zoom. Three are
repairs to something already built and one is new behaviour; they are specified together because
two of them touch the same axis arithmetic and would otherwise be written twice.

The numbering is theirs, restated: **1** the Year view looks broken, in four distinct ways;
**2** clicking a group should fit the timeline to that group; **3** the rails sidebar reads as a
list of links and offers no way to add a feature; **4** a hover card truncates the name it exists
to show.

## 1. The Year view

### 1.1 Months instead of weeks, which is also what aligns the lines

The header draws two rows at every zoom: calendar quarters over sprint ticks. At Year the stops
are 4px a working day, so a ten-day sprint is a 40px cell carrying a `W40–41` label it cannot
hold, and two hundred of them run off the end of the plan. That is the density complaint.

The alignment complaint is the deeper one, and it is not a rounding error. The top row is a
**calendar** quarter — variable width, edges on the first working day of January, April, July,
October. The bottom row is a **sprint** tick — a fixed `sprintLengthDays` counted from the plan's
own day zero. Those two families of edges coincide only by accident. No amount of care makes a
sprint boundary land on a quarter boundary, because a plan does not start its sprints on the first
of a quarter and has no reason to.

Months do nest. A calendar quarter is exactly three calendar months, so every quarter edge is also
a month edge and the two rows share every line they both draw. So:

**At the Year rung the second row is months, and the grid under it draws month rules.** At the
Quarter and Sprint rungs nothing changes: quarters over sprint ticks, sprint rules on the grid.
That is deliberate rather than an omission. A plan is *scheduled* in sprints; at the two rungs
where a reader is looking at individual work, the sprint boundary is the line they need, and
trading it for a calendar line that happens to align would be tidier and less useful. The
misalignment survives there and is correct: it is two true statements about time, drawn at the
scale where both are legible.

`monthBands` joins `calendarBands` in `@repo/canvas`, built the same way and for the same reason —
name the month's first calendar date, ask `dateToDay` for the offset, take the next month's as the
exclusive end. That is a walk over bands and not over days, so a year is twelve `dateToDay` calls
rather than two hundred and sixty. Weekend rounding carries the same meaning it already does: when
a month opens on a Saturday its first *working* day is the Monday, and so is the offset.

`CalendarBand` gains nothing. A month band wants a different label and a different key, so
`MonthBand` is its own interface with its own `label` (`Oct`, and `Oct 2027` is **not** needed —
the quarter above it carries the year) and its own `month` ordinal for a renderer to key on.

### 1.2 No names on the canvas, of anything

Stated as a rule and not as a tweak: **the canvas draws geometry and never text.** A feature's
name is on the bar today, and at the node rungs it is beside the point. Both go.

This is a deletion, which is the best kind of change this one could be:

- `canvas/bar-label.tsx` — gone.
- `canvas/mark-metrics.ts` loses `LABEL_METRICS` and `NODE_LABEL_METRICS`; `LAYOUT`, `BAR_GAP` and
  `NODE_RADIUS` stay, being geometry.
- `canvas/view.ts` loses `labelsOf` and `featureNames`, and `RailFrame` loses `labels` and `names`.
- `@repo/canvas` loses `bar-labels.ts` with `barLabels`, `BarLabel` and `LabelMetrics`, and
  `index.ts` and `entry-points.test.ts` lose them from the exported surface. That file asserts the
  export list in both directions, so this is a change it will demand rather than permit.
- `canvas/pointer-css.ts` loses `'bar-label'` from `LIT_SLOTS` and the rule that lit it.
- `labels/group-css.ts` loses `[data-slot="bar-label"]` from the slots a group selection dims.

What a reader loses is the ability to name a bar by looking at it, and what replaces that is
already built three times over: the rail tree names every feature, the table names every feature
and item in a cell with a header, and the hover card names whatever the pointer is on. §4 below
is what makes the third of those tell the whole truth.

What the canvas gains is one fewer `<text>` per feature on a surface whose element count is the
thing that grows with the plan, and an end to the budget arithmetic — `maxChars`, `minInside`,
`MIN_READABLE` — that existed only to decide how much of a name would fit.

### 1.3 The canvas has to reach the edge of its pane

The grid stops partway across the pane and leaves bare ground to the right of it.

The cause this specifies a fix for: `PlanCanvas` computes `width = canvasWidth(scale, range)` and
hands that same number to every `Rail`, which draws its band `<rect>` and its bottom hairline to
it. But the grid beside them is drawn for `chromeRange(range)` — the range bled by `BLEED_DAYS`,
120 working days. So the quarter wash and the tick rules run 120 days further right than the rail
bands and the rules that separate them, and the row structure visibly ends while the chrome
carries on. **A rail's band and hairline are bled with everything else**, and the bleed stops
being a thing each layer opts into: `canvasWidth` takes the already-bled range, or the components
take a bled width, and there is one width on the canvas rather than two.

There may be a second cause stacked on the first, and the implementation measures before it
assumes. The SVG is `block w-full` over a `minWidth`, and a percentage width resolves against the
**containing block** — the visible pane — rather than against the scroller's scrollable width. The
header beside it is a `width`-constrained box whose absolutely positioned cells overflow it, and
overflow from a positioned child does extend a scroll container's scrollable area. If those two
disagree, scrolling right reveals a strip of ground the SVG never covered, and the fix is to size
both from one number. This is checked in a browser rather than reasoned about further, because the
reasoning above has two plausible endings and a measurement has one.

## 2. A group chip fits the timeline to its group

Today a chip is a `<label>` for a radio and selecting a group costs no JavaScript, no state and no
round trip (ADR 0064): the generated sheet dims everything outside it. That stays exactly as it
is. What is added is that the view also moves to the group.

**The mechanism is the three zoom stops, not a free scale.** The group's span is computed from
`plan.schedule.spans` — the lowest `startDay` and the highest `endDay` over the features carrying
that label — and handed to `bestFit` as its `lastDay`. `bestFit` already walks the stops finest
first and takes the first whose range fits the pane, which is precisely the product owner's own
rule: a group spanning at most two sprints is the item rung's own threshold, so "if it spans max 2
sprints show full timeline with items" falls out of the existing arithmetic rather than being
written again beside it.

An exact fit was considered and declined. Matching the group's first and last day to the pane's two
edges requires measuring the pane in the browser and inventing a `pxPerDay` outside the three
stops, which leaves the zoom control with no rung to show as active and the detail level — bars
against nodes — derived from a scale nobody chose. The cost of the chosen mechanism is honest and
small: a group fills most of the pane rather than all of it.

**The scroll is the wheel zoom's own anchor, reused.** Changing the rung changes `pxPerDay`, and
the new scale only arrives after the server redraws — so the day to land on is recorded on the way
out and applied by an effect watching `pxPerDay`, which is the two-effect shape `use-wheel-zoom.ts`
already carries and the reason it is shaped that way. The target is the group's first day at the
left edge, which is `scrollFor` with a `pointerOffset` of zero.

**Where it lives.** `GroupChipRoot` is already a delegation root over the chips, mounted for the
double-click that opens a group's drawer. The click handler joins it there. It must not call
`preventDefault`: the label's default action is to check its own radio, and suppressing it would
make a click that fits the view also fail to select the group it fitted to. That file's TSDoc
currently says "Nothing here touches `click`" and will say something else.

Each chip carries `data-from-day` and `data-to-day`, computed on the server, for the same reason
every other datum the pointer layer reads is an attribute: no part of the plan crosses the client
boundary as data (`module-boundaries.test.tsx`), and the root resolves what was hit out of the
markup. The **All work** chip carries neither, and selecting it restores the plan's own opening
fit — `openingZoom` with the scroll at zero.

A group with no features, or whose features are all unplaced, has no span. Its chip carries no day
attributes and clicking it selects without moving the view, which is the only honest answer: there
is nothing to fit to, and guessing a window would move the reader somewhere arbitrary.

## 3. The rails sidebar

Three complaints, one of which is a missing feature.

**There is no way to add a feature.** Confirmed by reading the routes: `new/rail` and `new/group`
exist and nothing else. A feature can be created only from a drawer already open on something
else, because `CreateControls` takes its `railId` from the subject the drawer is open on. The one
exception is `RailFeature`, which is mounted on the rail drawer with a field id of
`new-feature-<epicId>` — so the control exists and is simply three clicks deep.

So each rail row gains an **add** control: a link to `/plans/<planId>/r/<epicId>#new-feature-<epicId>`,
landing on the field that does the thing. That is `table/row-actions.tsx`'s pattern exactly, and it
is a link for that file's reasons — a button per rail is an island per rail, and the drawer already
holds the control with its own validation and its own refusal wording.

It is drawn only where `routes.rail` is non-null, which is the admin surface. The seat surface
addresses features and items and has no rail drawer at all, so a seat holder is offered nothing
that would send them to a URL they have no cookie for — the same rule ADR 0032 states and the same
one that moved `newRailHref` out of `PlanScreen` in the previous revision.

**A row reads as a link.** Because it is one: `hover:underline` on the name, and nothing else in
the row responds. The row becomes the hover surface — a background change across the whole row,
with the underline dropped — so hovering says "this row" rather than "this word", and the add
control appears on hover and on `focus-within` so a keyboard reaches it without a pointer.

**Margins.** The rows are tight enough that the caret, the swatch and the name run together. Row
padding grows, the caret gets a hit area worth aiming at rather than a 16px glyph, the feature
indent becomes legible as an indent, and the sticky head's spacing matches the rows under it.

This section is the one the product owner described as a feeling rather than a mechanism, so it is
also the one most likely to need a second pass after it is seen. It is specified as above and
expected to be revised.

## 4. The hover card tells the whole name

`CARD.title` is `truncate`, so the card put up to identify something cuts off the thing that
identifies it. It wraps instead, inside the card's existing `max-w-80`.

This matters more after §1.2 than it did before. With names off the canvas entirely, the card is
the only way to name a mark without leaving the board, and a truncated title would make the
gesture that replaced the labels worse than the labels were.

## 5. Out of scope

- A free zoom scale. §2 settles this: three stops, chosen between.
- Changing the Quarter or Sprint header rows. §1.1 argues why the sprint tick stays there.
- Any change to `@repo/schedule`'s forward pass. No bar moves because of anything here.
- Naming a month with its year. The quarter row above it carries the year, and a reader reads the
  two rows together or the header has failed at something larger.
- A second pass on the sidebar's visual design, which §3 anticipates rather than attempts.

## 6. How it is verified

Each slice is test-driven: the pure arithmetic — `monthBands`, the group's span, the stop chosen
for a span — is tested in `@repo/canvas` and beside its own module before any component draws it,
and the components are tested on what they render.

Two things are checked in a browser and not only in `happy-dom`, because `happy-dom` answers every
`getBoundingClientRect` with a zero `DOMRect` and cannot be asked either question: that the grid
reaches the right edge of its pane at every zoom and stays there when scrolled (§1.3), and that a
group chip's click lands the group where it says it does (§2).

## 7. As built, six things differ from the above

Written after the work, so that the spec says what shipped rather than what was planned.

**§1.3's second cause was real, and it was neither of the two guessed at.** The rail bands were indeed
drawn to the unbled width, and fixing that was not enough. `DragRoot`'s frame is `w-fit`, and
`fit-content` shrinks to the SVG's own `minWidth` — so a 1040px canvas in a 1412px pane got a 1040px
frame, and the SVG's `w-full` then resolved against the frame rather than against the pane. The
canvas had never filled a wide pane, and `plan-canvas.tsx`'s own note claiming it did had been wrong
since the frame acquired a width. The frame is `w-full min-w-fit` now, which is what the header and
the canvas both say. This is exactly what the spec reserved a measurement for, and it is why the
measurement was worth taking rather than reasoning further.

**§2's `bestFit` was the wrong function, and the fixture is what showed it.** `bestFit` routes each
offer through `rangeFor`, which pads a window out past its last day to a whole sprint boundary. That
is right for opening a plan and wrong for a window that already has edges: a group of exactly two
sprints, padded by one more, no longer fits at the stop that exists to hold two sprints — so the
plainest statement of the rule would have been false. `bestSpan` is the unpadded form, sharing
`bestFit`'s own `TOLERABLE_OVERFLOW` so the two cannot disagree about what fits. It reads no
`sprintLengthDays` at all, which `rungs.ts` already accepted for `ITEM_RUNG_MAX_DAYS`: "two sprints"
means two ten-day sprints, and a plan on longer sprints reaches a finer stop at fewer of its own.

**§2's scroll is clamped by the browser near the end of a plan, and that is left alone.** A group
starting at day 47 of a plan that ends shortly after cannot have its first day brought to the left
edge, because there is nothing to the right of it to scroll into; the browser stops at the scroll
maximum. Measured: the group's bar was nevertheless fully inside the pane. The alternative — padding
every axis with a screenful of empty days so that any day can reach the left edge — costs every plan
something to serve a handful of groups, and was not taken.

**§1.1's header needed a second threshold.** `NAMEABLE` is 48px, measured for `Q4 2026`. A month cell
carries three letters, and reusing 48 would drop the name off cells wide enough to hold it, so
`NAMEABLE_MONTH` is 24. A clamped first month still draws its cell and no text, for the reason a
clamped quarter does.

**§3's field id needed a module of its own.** The plan was for the sidebar to link to the field
`rail-feature.tsx` already gives its input. That component is `'use client'`, and a server component
importing from a client module gets client *references* rather than functions — so calling the id
builder on the server would not have worked. `rails/rail-anchors.ts` is one line in a module neither
side has to be.

**Two guards caught things no test of mine would have.** The Tailwind scan test refused a template
literal in `sidebar-css.ts` that split class names across an interpolation, which would have shipped
rows with no padding. And `module-boundaries.test.tsx` demanded `allFit` be threaded through both
surfaces rather than derived where the chips are rendered.

## 8. What was checked in a browser

Against a seeded plan at 1900×800 and 1100×900, after the gate:

- **§1.1** — 19 month cells and no week cells at the Year stop; labels `Oct, Nov, Dec, Jan, …`; every
  quarter cell's left edge is also a month cell's left edge, with none unmatched. 19 month rules on
  the grid and no sprint ticks.
- **§1.2** — zero `<text>` elements on the canvas at every stop.
- **§1.3** — on a 1412px pane the frame, the canvas and the header all end at the pane's right edge
  and the scroller grows no scrollbar; on a 612px pane the canvas is 1040px and scrolls, the header
  agrees to the pixel, and the bled rail band still covers the pane after scrolling to the end.
- **§2** — a chip carries its stop and its day; clicking `Phase 0` stepped 4 → 42 px/day and selected
  the group; clicking a group already at the drawn stop scrolled immediately and **exactly**
  (`scrollLeft` 126 against a wanted 126, drift 0); `All work` returned to 14 px/day, scroll 0, with
  nothing dimmed.
- **§3** — one add per rail, each linking to its own rail's drawer and field id, labelled `Add feature
  to <rail>`, resting at zero opacity, and never on a feature row. Following one landed on a real
  text input in the viewport with an `Add feature` submit beside it, and submitting it created a
  feature that appeared in the tree under that rail.
- **§4** — the card's title renders in full with `white-space: normal` and no ellipsis, and a title
  too long for the card's 320px wraps to a second line rather than clipping.
