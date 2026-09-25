# ADR 0055 — Canvas geometry is its own pure package, because a measurement cannot be tested here

**Status:** Accepted · 2026-09-23

## Context

The spec contradicts itself about where the timeline's arithmetic lives, and phase 2 had to settle
it. §4's architecture table puts "the forward pass, cycle detection, day→sprint→calendar arithmetic,
layout maths" in `@repo/schedule`. §4.1, three paragraphs later, publishes that package's surface in
full — "Its public surface is small and total" — and the block under that sentence holds exactly
`schedule`, `sprintOf` and `rangeOfSprint`. There is no layout in it. §5 then names three layout
functions by name, none of which appear in that surface: "Layout is **pure functions** —
`railLayout`, `dayToX`, `itemsToMarks` — unit-tested with no DOM, with the React component a thin
renderer over their output. An SVG canvas is otherwise untestable except through screenshots."

ADR 0049 wrote the forward pass into `@repo/schedule` and left the layout question open, because
phase 1 had no canvas. Phase 2 has one — the first SVG this codebase lays out itself rather than
receives from an icon library, and the only `<svg>` element authored anywhere in `apps/` or
`packages/` — and the question is now load-bearing in a way the spec's own sentence about
screenshots understates.

**Because `happy-dom` makes a measurement assertion vacuous, not merely awkward.** On the pinned
`happy-dom@20.14.3`, `Element.getBoundingClientRect()` returns `new DOMRect()` under the comment
`// TODO: Not full implementation`, and `SVGGraphicsElement` answers `getBBox()` with `new DOMRect()`
and `getCTM()` and `getScreenCTM()` with a bare `new DOMMatrix()`. A zero rect and an identity
matrix, for every element, in every test. `apps/macroplan/vitest.config.ts` splits its suite by
extension — `**/*.test.ts` in an `environment: 'node'` project and `**/*.test.tsx` under
`happy-dom` — so every test that renders a component is in the lane where those stubs live. A test
that asserted a bar's width by measuring the bar would pass at 14px per working day, at 45, and at
zero.

So §5's "pure functions, unit-tested with no DOM" is not a style preference here. It is the only
arrangement under which the geometry is checked at all: **geometry that is not pure is geometry that
cannot be tested in this repository.** Everything below follows from that, including the one thing
that is still untested and is recorded as such.

## Decision

**`packages/canvas` — `@repo/canvas` — holds every number the timeline is drawn from, and holds no
React, no DOM, no Zod and no `node:` specifier.** Seven modules — `scale.ts` for the viewport,
`plan.ts` for the shapes a layout reads, `rails.ts` for a bar per placed feature, `marks.ts` for a
strip per placed item, `bands.ts` for quarter bands, sprint ticks and the today line, `rungs.ts` for
§5's detail level, `treatment.ts` for §5's "Status owns treatment" — behind one barrel with one `.` in
the `exports` map, and 98 tests across eight files, every one a `.test.ts` in the node lane because
`packages/canvas/vitest.config.ts` includes `src/**/*.test.ts` and declares no environment at all.

**It is not part of `@repo/schedule`, and the reason is the consumer on the other side.** §4.1
published that package's surface as three functions, and `apps/api` depends on it: the read path
reaches `schedule()` through `@repo/macroplan-domain`'s `planView`, and `agreement.test.ts` imports
the package directly to check the route's answer against a second run of the pass. A package the API
depends on must never learn what a pixel is. The two also answer different questions — `@repo/schedule`
says *when* work happens, in working-day offsets that mean the same thing in two timezones (ADR 0049);
`@repo/canvas` says *where that lands on a screen* — and a suite holding both could not tell a wrong
pass from a wrong layout.

**It is not in `@repo/contracts`.** That package keeps a standing rule of depending on `zod` and
nothing else, and its `package.json` still reads `"dependencies": { "zod": "catalog:" }`. ADR 0036
draws its line narrowly — a wire fact, or a pure function over a document — and ADR 0049 already
refused the forward pass there. A layout package needs a runtime dependency on `@repo/schedule`,
which that rule forbids outright.

**It is not in `@repo/ui`.** A layout function has to name this product's wire shapes — a plan's
epics, features, items and spans — and `@repo/ui` is shared by two products. The precedent is
`packages/ui/src/transfer/vocabulary.ts`, which restates a structurally widened local interface rather
than importing the real one, and says why in its own words: "`role` is a plain string rather than this
repo's three-role union because this package is shared by two products and must not learn one
product's vocabulary (ADR 0014)". `@repo/canvas` uses the same technique one level down — `CanvasSpan`
and `CanvasSchedule` are widened restatements of the wire shapes — but it is a Macroplan package, so
it may name them at all.

**It is not left in `apps/macroplan`, and the line between the two is worth stating**, because the app
does keep a geometry module of its own. `components/plan/canvas/view.ts` holds this screen's chosen
constants — `CANVAS_RANGE` of sixty working days, `CANVAS_SCALE` at 14px per day with a 160px gutter,
the fixed rail measurements, the `viewBox` — and it is a `.ts`, so it runs in the node lane and is
tested. The split is: **the package holds what is arithmetic over the model; the app holds what this
screen chose.**

### What the implementation found that the plan predicted wrongly

**`@repo/canvas` declares one runtime dependency, and the plan predicted none.** `rails.ts`
value-imports `railsOf` from `@repo/schedule` and calls it, so the dependency is real rather than
type-only, and `package.json` carries `"dependencies": { "@repo/schedule": "workspace:*" }`.
`purity.test.ts` pins that exactly — its `describe` reads "the package declares no runtime dependency
beyond @repo/schedule, whose rail order it calls rather than re-derive", and the assertion is a
`toEqual` on the whole `dependencies` object, so a second dependency fails rather than passes. Its
`node:` half is the same shape as `@repo/schedule`'s and exists for the sharper reason that this
package is imported by a browser bundle: a `node:` specifier here "is a browser bundle that will not
build".

That import is the point rather than a concession. `railsOf` is the forward pass's own total order,
and `rails.ts` refuses to re-derive it: "a second total order written in this package could disagree
with the first on any tie — which is a bar drawn on the wrong rail, silently, at exactly the zoom
level nobody tested."

**`CanvasEpic extends ScheduleEpic { colour }` was forced.** `ScheduleEpic` in
`packages/schedule/src/structure.ts` is `{ id, railOrder }` and nothing else — the forward pass never
needed a hue, so it never carried one. The canvas cannot draw a rail without one, and §5 gives hue to
the epic. Extending rather than restating is what keeps a `CanvasPlan` passable to `railsOf` as-is.

**A contracts-shaped `PlanView` satisfies `CanvasPlan` with no adapter and no cast, and that is held
by compilation rather than by an assertion.** `apps/macroplan` reads `Plan`, which is
`Decoded<typeof PlanView>` from `@repo/contracts`, and `plan-canvas.tsx` hands that value straight to
`railLayout`, `itemsToMarks` and `treatmentsOf`; the app's typecheck fails the day the two shapes
diverge. The negative control is **stated** in that file and asserted nowhere: passing `{ ...plan }`
would be a fresh object literal, and excess-property checking would then reject `id`, `name`,
`shareLinks`, `createdAt`, `updatedAt` and `schedule` one by one. The `@ts-expect-error` that does
exist in that subtree pins a different claim — `plan-screen-model.test.ts` fails the typecheck if a
plan carrying `shareLinks` ever becomes assignable to `PlanScreenModel` (ADR 0033). So the only thing
behind this structural compatibility is `pnpm --filter macroplan typecheck`.

**`rungFor` takes a `DayRange`, not a `PlanScale`.** §5 specifies its three rungs as time visible on
screen — `~1–2 years`, `~1 quarter`, `~1–2 sprints` — and time on screen is a width divided by a
px-per-day, not a px-per-day. The first implementation divided §5's table by an assumed 900px canvas,
which was wrong twice: that cap was being removed by this same phase, and the answers were off by the
ratio of any other width. `rungs.ts` records the arithmetic — "at 45px per day a 900px canvas shows
two sprints and a 1600px canvas shows three and a half, which are two different rows of §5's table" —
and takes the visible range instead, which `bands.ts` had already decided for every other chrome
function: a viewport was left off `PlanScale` on purpose "so every chrome function here is told its
range explicitly rather than guessing one from a px width". Nothing is added to a call site, because
`quarterBands`, `sprintTicks` and `todayLine` all demand a range already, and there is no invented
constant left to go stale.

**`todayLine` returns `null` for exactly one reason and throws on an invalid instant.** The one reason
is a plan whose `timezone` this runtime cannot resolve, probed with the same
`new Intl.DateTimeFormat('en-US', { timeZone })` that `@repo/contracts` refines `Timezone` with, and
that probe is the only thing inside the only `try` — so a caller who lost the today line has one
diagnosis rather than three. An invalid instant throws a `RangeError` naming the function, and is
checked first.

The reason for *catching* rather than propagating is the part worth keeping. ADR 0049 recorded that
`todayIn` refuses an unresolvable zone rather than falling back to UTC, "because a plan silently drawn
a day off is worse than a refusal". The two are not in tension, and `bands.ts` says why: `todayIn` has
only two answers available, the right date or a wrong one, while `todayLine` has a third — **draw the
plan and draw no today line** — which is neither a wrong date nor a lost canvas. That third answer
exists only because nothing else in the package reads a zone: every bar, band and tick is arithmetic
over working-day offsets, so all of them are still correct when the zone is what failed.

## Consequences

- **The geometry is checked and the measurement is not, and the gap is documented rather than
  hidden.** 98 assertions cover every offset, width and label in the package with no DOM anywhere
  near them. What no test can reach is anything that needs a text metric: `quarterBands` records that
  a renderer must clamp a partly-visible band's **label** x into the viewport rather than the band's,
  and that this "is invisible to a test: `happy-dom` stubs `getBBox` and `getBoundingClientRect` to a
  zero `DOMRect`, so nothing that measures text can discover it, and nothing here can."
- **ADR 0027's import list gains two entries at once**, not the one ADR 0049 predicted:
  `apps/macroplan/package.json` now depends on `@repo/canvas` **and** `@repo/schedule`, the latter
  imported directly by `components/plan/table/rows.ts`. Neither needed a lint change, which is the
  finding ADR 0027's own amendment of this date records.
- **The package builds to `dist/`**, like `@repo/schedule` and unlike `@repo/ui`, so a change to
  `src` is invisible to a consumer's suite until it is rebuilt.
- **The barrel is deliberately narrower than the module set.** `spansById` is not exported — two
  modules share one map instead of publishing it — and neither are `ITEM_RUNG_MAX_DAYS` nor
  `FEATURE_RUNG_MAX_DAYS`, because a caller passes a range and reads no threshold.
  `entry-points.test.ts` pins the whole export list, so a later module cannot land on the barrel
  unnoticed. `rungFor` being the only way to obtain a `Rung` is part of the same discipline: it keeps
  §5's refusal of two independent controls from reappearing as a prop.
- **Phase 3 inherits the seam it needs.** `range` and `scale` are props of `PlanCanvas` with defaults,
  so zoom and pan change an argument rather than a module.

## Alternatives considered

**Widen `@repo/schedule` to hold the layout, as §4's table says.** One package, one import, and the
spec's own table on side of it. Rejected because `apps/api` depends on that package: a viewport, a
gutter and a px-per-day would then sit in the API's dependency graph, and the agreement test would run
inside a package that also owns pixels. §4.1's published surface settles it; §4's table is the half
that was wrong.

**Put it in `@repo/contracts`.** Precedent exists — ADR 0036 moved `countTasks()` and
`emptyDocument()` there. Rejected on the same two counts ADR 0049 gave: that package's line is drawn
at a wire fact or a pure function over a document, and its standing rule is `zod` and nothing else,
while this package needs `@repo/schedule` at runtime.

**Put it in `@repo/ui` beside the components that render it.** Rejected: `@repo/ui` is shared by both
products and may not name one product's wire shapes, which is the rule
`packages/ui/src/transfer/vocabulary.ts` exists to observe rather than break.

**Leave the geometry in `apps/macroplan` and skip the package.** The strongest alternative, because an
app `.ts` file *is* in the node lane, so purity alone does not force a package boundary. Rejected on
reuse: the table reads `treatmentsOf` from the same place the canvas reads `railLayout`, so there were
two consumers before the package was a day old, and nothing outside an app can import one.

**Make the `@repo/schedule` dependency type-only and re-derive rail order locally.** It would have kept
the plan's prediction of no `dependencies` field true. Rejected: a rail order derived twice can
disagree on any tie, and the failure mode is a bar on the wrong rail with both packages' tests green.

**Add `colour` to `ScheduleEpic` instead of extending it.** One epic shape rather than two. Rejected:
the forward pass has no use for a hue, and putting a presentation field on the pass's own input would
push it into `apps/api` and into the agreement test, for a package neither of them imports.

**Derive the rung from a `PlanScale` plus a canvas width.** What the plan assumed, and it reads more
naturally at the call site. Rejected on the arithmetic above: the assumed width was a constant nobody
measured, the cap it came from was being deleted in the same phase, and every canvas of another width
gets a different row of §5's table.

**Let `todayLine` propagate the `RangeError` an unresolvable zone raises.** Consistent with `todayIn`,
and one fewer branch. Rejected: taking the whole timeline away because one runtime's tz database
disagrees with another's would lose every bar, band and tick that is still correct. The converse —
widening `null` to cover a bad instant too — is refused for the mirror reason: an absent today line
would then be read as a tz-database mismatch when the cause was a bad clock read.

## Amended · 2026-09-25 — a second kind of pure function, and three counts phase 3 falsified

Phase 3 added a drag, and a drag needs the one thing this package did not have: an **inverse**. This
record was written for layout geometry — a model in, a position out — and `packages/canvas/src/drag.ts`
runs the other way, taking a point and answering the placement it names. The argument above covers it
exactly, and the amendment is to say so rather than to change anything.

**`drag.ts` is `railAtY` and `dropTargetFor`, and both are arithmetic over numbers.** `railAtY` is the
inverse of `railTop` in `apps/macroplan/components/plan/canvas/view.ts` — that file holds the forward
direction, this one the reverse — and `dropTargetFor` answers the `(epicId, position)` a drop falls in.
Neither takes a pointer event and neither takes a rect: they take a `DragPoint` of two numbers and a
`RailMetrics` of two more. That is the same split this ADR drew for the forward pass, and the
`happy-dom` consequence is the whole reason for it. The impure step — turning one `pointerdown` into
those numbers, which needs `getBoundingClientRect` for the screen-to-`viewBox` ratio — is **one line**
in `components/plan/canvas/drag-root.tsx`, and it is the only measurement in the phase. Every test here
is handed a zero `DOMRect`, so that line is asserted against 0 and against nothing else; the arithmetic
around it (`originAt`, `travelledBy`, `settledAt`) is pure and tested directly, and ADR 0058 records the
browser check the line is handed forward with. So the package grew an inverse projection without growing
an untestable line, which is what the "geometry that is not pure is geometry that cannot be tested in
this repository" sentence above was for.

**`RailMetrics` is handed in rather than declared, for the reason this ADR gives about `@repo/ui`.** A
rail's height and the chrome above the first rail are fitted to a type size, and a package with no
viewport and no type size has no grounds to choose either. So `drag.ts` asks for the two numbers and
`view.ts` supplies them out of the record it renders every rail from — "hand over the record that is
rendered from, rather than a fresh literal at the call site", because a second literal is a band this
reads and a band the SVG drew, free to disagree.

**The guarantee that keeps those two spellings in step cannot be written the obvious way.** `LAYOUT`
carries ten fields and `RailMetrics` names two, so passing an identifier runs no excess-property check
and the subset relation held by hand until phase 3 wrote it down. The clause is
`as const satisfies RailMetrics & Record<string, number>` and **not** `satisfies RailMetrics`, which does
not compile: `satisfies` excess-checks an object **literal**, so each of the other eight fields is
rejected as unknown to that interface. Measured rather than reasoned — with the intersection removed,
`pnpm --filter macroplan typecheck` answers
`view.ts(100,3): error TS2353: Object literal may only specify known properties, and 'barHeight' does not exist in type 'RailMetrics'`.
The intersection says the two things that are wanted: the record carries whatever `RailMetrics` names,
spelled the way that package spells it, and is otherwise a record of numbers. What it cannot check is
that the other eight are only numbers of this file's own choosing — a field added to `RailMetrics` that
this record already has under the same name and a different meaning would pass, which is a hazard the
annotation shares with the assignment it replaced. `as const` still comes first, so nothing widens to
`number`.

**Three counts in the Decision above are now wrong, and they were right when written.**

- **Seven modules are eight**, `drag.ts` being the new one, and the barrel still has one `.` in the
  `exports` map. `entry-points.test.ts` pins the whole export list, so `DragPoint`, `DropQuery`,
  `DropTarget`, `RailMetrics`, `dropTargetFor` and `railAtY` arriving on it was an assertion to update
  rather than a thing to notice.
- **98 tests across eight files are 164 across nine**, every one still a `.test.ts` in the node lane.
- **"The only `<svg>` element authored anywhere in `apps/` or `packages/`" is no longer true.** There are
  two: `plan-canvas.tsx`'s, still server-rendered, and `drag-ghost.tsx`'s — a second `<svg>` at the same
  `viewBox`, absolutely positioned over the first, which is what places the ghost without measuring
  anything. The sentence was a fact about phase 2 rather than a rule, and the rule it was evidence for —
  that this is the only place in the repo laying out an SVG itself — still holds, both files being drawn
  from this package's numbers.

**One prediction held and is worth confirming.** "Phase 3 inherits the seam it needs: `range` and
`scale` are props of `PlanCanvas` with defaults, so zoom and pan change an argument rather than a
module." Phase 3 ships neither zoom nor pan, and it needed the seam anyway: `drag-root.tsx` is handed
`pxPerDay`, `gutter` and `axisX` as numbers threaded out of the one `canvasLayout` call, so `scaleFor`
rebuilds the scale that drew the bars rather than reading a module constant. A canvas whose scale came
from an import would have made the drop resolvable against a scale the SVG was not drawn at, the first
time a caller passed a different one.
