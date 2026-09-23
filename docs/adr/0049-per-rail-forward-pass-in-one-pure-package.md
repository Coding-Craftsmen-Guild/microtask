# ADR 0049 — Per-rail forward pass, in one pure package both sides import

**Status:** Accepted · 2026-09-23

## Context

ADR 0048 decides that every span on a Macroplan canvas is derived on read. This record is about the
derivation itself: what it computes, where the code lives, and what it does when the plan it is
given contradicts itself.

Two consumers need it, and they are on opposite sides of the API. `apps/api` derives the schedule to
answer a read, in phase 1, today. The browser derives it to draw the canvas in phase 2 and to show a
drag before the round trip completes in phase 3. If those are two implementations they will
disagree, and the disagreement presents as a bar that jumps when you let go of it — a defect whose
unit tests all pass on both sides. (**Amended 2026-09-23:** phase 2's browser calls `schedule()`
nowhere — it draws the schedule the API served and imports this package for the derived order and the
estimate arithmetic. The second derivation is phase 3's. See the amendment at the end.)

## Decision

### `@repo/schedule` holds the pass, and it is a package of its own

`packages/schedule/` — `structure.ts` for the input and output types, `derived-order.ts` for rails,
`estimate.ts` for what a feature is worth, `cycles.ts` for Tarjan, `relax.ts` for the placement
sweep, `forward-pass.ts` for `schedule()` over the lot, `calendar.ts` and `sprints.ts` for the
day-offset-to-date arithmetic.

The binding constraint is **ADR 0027**, which limits what a Next app may import and bans a
`*-domain` package by name in each app's own `no-restricted-imports` block. The ban is not
stylistic: `@repo/macroplan-domain`'s barrel exports `./storage/paths.js`, which imports
`node:path`, and `./storage/fs-plan-store.js`, and the package depends on `@repo/kernel`, whose
`ids.ts` imports `node:crypto`. Putting the pass there would make it unreachable from the browser
that needs it most.

So the package is **pure, and that is enforced rather than intended**.
`packages/schedule/src/purity.test.ts` walks every shipped `.ts` file in the package and fails on
any `node:` specifier in any quote style or import form, and separately asserts that
`package.json`'s `dependencies` is empty or absent. It is: `@repo/schedule` depends on nothing at
all, not even Zod. `packages/schedule/src/testing/entry-points.test.ts` keeps the seeded plan
generator out of the main entry, so a browser bundle cannot pull the test fixtures in behind it.

### Each epic advances independently

A rail is one epic's features in `(position, id)` order, and the rails themselves are in
`(railOrder, id)` order — both keys are pairs because neither number is guaranteed distinct, so
`derived-order.ts` breaks every tie by id and the order is total. A feature waits on the nearest
**earlier schedulable** feature of its own rail, so an unestimated feature does not cut the chain
between its neighbours. Nothing else couples one rail to another.

That is the shape of the product, not an optimisation. Three epics are three teams working in
parallel, so a plan's length is its critical path and not the sum of its work — pinned by name in
`forward-pass.test.ts`: *"three epics are three teams, so the plan is its critical path and not the
total work"*, three ten-day rails making a ten-day plan rather than a thirty-day one. A reader of
the canvas can therefore take a rail at face value: it runs left to right in its own order, and the
only reason a bar on it sits further right than its neighbour ended is an arc drawn from another
rail or a pin.

**A dependency can only ever push a feature later.** `start` is the greatest of 0, every placed
predecessor's `end`, and `pinSprint * sprintLengthDays` — a `Math.max` over lower bounds, so adding
an edge or a pin can delay a feature and can never move one earlier. `forward-pass.property.test.ts`
asserts it directly over a thousand seeded plans (*"monotonicity: one more edge can only ever
delay"*), alongside pins holding, rail order never running backwards, and the answer being
independent of the order the arrays arrived in.

### `schedule` is total: a cycle is returned and rendered, never thrown

`schedule()` never throws and never partially fails. A plan with a cycle, a dangling edge, a missing
estimate or no epics at all comes back as a `ScheduleResult` describing exactly that, across four
channels that a caller reads differently:

- **`days`** — a `Map` from feature *or* item id to a `{ startDay, endDay }` span, `endDay`
  exclusive, so a zero-day milestone has `start === end`. This is the bar.
- **`cycles`** — every strongly connected component of the `dependsOn` graph with more than one
  member, plus any self-edge, from Tarjan in `cycles.ts`; ids ascending within a cycle, cycles
  ascending by first id. Every feature named here is off the axis, and so is every item under it.
- **`unscheduled`** — `{ id, reason }` where `UnscheduledReason` is `'no-estimate'` or `'in-cycle'`.
  The two are different sentences for a reader: *nobody has sized this yet*, versus *this is caught
  in a loop you drew*. A caller shows the first on an unscheduled rail below the canvas and the
  second in the conflict list, and neither is a bar.
- **`ignoredEdges`** — a dependency dropped to break a rail-versus-dependency deadlock, named rather
  than discarded. This is the channel that is easy to get wrong: the feature named here **did** get
  a span. One of its stated dependencies was merely set aside to produce it, because a feature
  earlier on its rail that depends on a later one states two orderings that cannot both hold, and
  rail order wins — a bar out of sequence on its own rail reads as a broken canvas rather than as a
  conflict. `findCycles` cannot see these: the `dependsOn` graph alone is acyclic in every one of
  them.

The argument for totality is about what a planning tool owes somebody who has just drawn a loop. The
domain refuses a cycle **at the write** — `FeatureService.setDependencies` throws `Conflict` naming
both features, answered as a 409 — so the only way one reaches `schedule()` is a volume edited by
hand or a plan restored from elsewhere. At that moment the user has a plan they cannot open. Raising
would lose the whole canvas, including every feature that is perfectly well placed, and would leave
no surface at all on which to fix the few that are not. So the loop is reported and everything
outside it is still scheduled, which `forward-pass.property.test.ts` asserts as a pair: every
in-cycle feature unscheduled with all of its items, and every other estimated feature still placed.

The same reasoning decides the smaller cases. An edge naming a feature id that does not exist is
dropped before the walk rather than reported — a dangling edge is a storage fault, not something a
user can see or fix, and naming a cycle nobody can find on the canvas would be worse than silence.
Ids are assumed unique and the assumption is not defended: a manifest with duplicate ids is corrupt,
and refusing one here would cost totality for a case nothing can produce.

### Calendar arithmetic never leaves UTC

Every date in `calendar.ts` is a `(year, month, day)` triple carried as a UTC-midnight instant and
advanced by whole multiples of 86 400 000 ms. UTC has no offset transitions, so no DST change can
widen or narrow a day and no plan can start on a wall-clock date its own zone skipped. A plan's
`timezone` is read by `todayIn` and by nothing else — grep the package and it appears in
`todayIn`'s body, in the `PlanCalendar` type that carries it, and in a test fixture.

An offset-free representation is what makes a span mean the same thing in two timezones. A span is
a pair of **working-day offsets**, and the offset-to-date conversion is `floor(x / 7) * 5 +
remainder` and its inverse, anchored at the Monday before the epoch — a division, never a scan, so
offset 2 000 costs what offset 1 costs. `calendar.test.ts` runs 251 consecutive days of a plan in
`Europe/Belgrade` across a real spring transition and a real autumn one, proves both transitions are
real by reading the hour back through `Intl`, and asserts the dates are identical to the same plan's
in UTC. `todayIn` is the single place a zone matters, and it refuses an unresolvable zone with the
`RangeError` `Intl` raises rather than falling back to UTC, because a plan silently drawn a day off
is worse than a refusal.

## Consequences

- **One pass, two consumers, checked against each other.**
  `apps/api/src/routes/macroplan/agreement.test.ts` runs `schedule()` from the package itself over
  the stored manifest and deep-equals the flattening against the `schedule` block the route answered
  (ADR 0048). It is the test that fails the day a second implementation appears.
- **The package builds to `dist/`**, unlike `@repo/ui` and `@repo/app-session`, which ship raw
  source for Turbopack (ADR 0025, ADR 0047). `apps/api` loads `@repo/*` from `dist/`, so a change to
  this package's `src` is invisible to the API suite until it is rebuilt.
- **ADR 0027's import list will need a fifth entry.** Today neither Next app depends on
  `@repo/schedule` — `apps/macroplan/package.json` lists `api-client`, `app-session`, `contracts`
  and `ui` — and each app's lint block is a denylist of `store`, `kernel` and the two `*-domain`
  packages, so nothing currently blocks the import. Phase 2 is when the dependency is added and when
  that list, as ADR 0027 writes it, has to grow. The reason it may grow safely is the purity test
  above: this package can reach nothing an app is banned from. **Amended 2026-09-23 — it gained two
  entries, and the mechanism changed instead.** See the section at the end of this record.
- **A conflict has four channels on the wire, not one.**
  `packages/contracts/src/schedule-view.ts` publishes `ScheduleSpan`, `ScheduleCycle`,
  `UnscheduledEntry` and `IgnoredEdge` as separate shapes, and `plan-views.test.ts` pins that an
  ignored edge is a fourth channel distinct from the other two. A canvas that could not tell "this
  bar ignores a dependency" from "this bar could not be placed" would have to guess which sentence
  to show.
- **The result is deterministic down to iteration order**, which is what makes an agreement test
  possible at all. Rails, features, items, cycles and ignored edges are each sorted on a total key,
  and `planSchedule` sorts the spans again by `(startDay, id)` because a `Map`'s order is a
  traversal detail nothing should be able to pin.
- `relax`'s sweep is `O(f·(f+e))` — Bellman-Ford shaped — which at 200 features and 400 edges is on
  the order of 10^5 operations. That is the budget phase 3 is spending when it re-runs the whole
  pass on a pointer move instead of patching a previous answer incrementally.

## Alternatives considered

**Put the pass in `@repo/macroplan-domain`.** It is this product's logic and it sits beside the
entities it reads. Rejected on ADR 0027: an app may not import a `*-domain` package, and the barrel
genuinely does reach `node:path` and `node:crypto`, so the browser half of the product could never
have the pass. The seam ADR 0014 draws between products is not the obstacle here — the storage
dependency is.

**Put it in `@repo/contracts`.** The real precedent, and a good one: ADR 0036 moved `countTasks()`
and `emptyDocument()` there for exactly this reason, so that a browser could compute optimistically
and arrive at arithmetically the same number as the server. Rejected on two counts. ADR 0036 draws
the line for that package narrowly — a value or a pure function over a document — and the forward
pass is several hundred lines of graph algorithm, Tarjan included; and `contracts` keeps a standing
rule of depending on `zod` and nothing else, where this code should depend on nothing at all. The
package boundary is also what keeps the pass testable as pure input to output, with neither HTTP nor
Zod anywhere near it.

**Throw on a cycle, and let the caller catch it.** Simpler signature, and it makes the bad state
impossible to ignore. Rejected: the write path already refuses a cycle with a 409, so throwing on
read would only ever fire on data a user cannot reach through the product — and it would take the
whole canvas away at the one moment the user needs it to find the loop. Returning the cycle costs
one field of the result and keeps every other feature on screen.

**Drop a contradicted dependency silently and place the bar.** The plan still renders, and nothing
in the result needs a fourth channel. Rejected: a pass that quietly ignored a stated dependency
would be a solver rewriting an executive's plan without saying so, which is exactly what spec §6
refuses. The edge is dropped — something has to give when rail order and a dependency contradict
each other — but it is named in `ignoredEdges`, deduplicated and sorted, so the contradiction stays
visible and fixable.

**Schedule the whole plan as one topological order rather than per rail.** One graph, one pass, no
notion of a rail at all. Rejected: it would let a feature's position on its own epic's rail be
decided by another epic's dependencies, so a rail could run backwards against its stated order. Rail
order is the one thing a reader is entitled to trust on sight, and `forward-pass.property.test.ts`
asserts it holds for every seeded plan.

## Amended · 2026-09-23 — what phase 2 did instead of what this record predicted

Three things in the body are now falsified by the code phase 2 shipped. Each is corrected here rather
than rewritten above, so nobody reads a prediction as a fact.

**ADR 0027's written list gained two entries, not one, and the mechanism changed rather than growing.**
`apps/macroplan/package.json` now depends on `@repo/canvas` as well as `@repo/schedule`, because the
timeline's geometry became a second pure package (ADR 0055) rather than joining this one. And the list
did not have to grow at all: ADR 0027's amendment of the same date measured the enforcement and found
it was a denylist of `store`, `kernel` and the two `*-domain` packages the whole time, so neither new
import touched a config. That record now states the denylist as the decision and stops claiming an
allowlist, which means the "fifth entry" this consequence asked for is a sentence in prose and not a
lint change. **The reasoning in it stands and is now the load-bearing part:** both packages may be
imported by an app because each carries a `purity.test.ts` that can reach nothing an app is banned
from, and under a denylist that guarantee is the only thing doing the work.

**The browser does not derive the schedule, and in phase 2 it never calls `schedule()`.** The Context
above says "the browser derives it to draw the canvas in phase 2", and that is not what happened: the
API derives the schedule, `planView` hangs it off the response (ADR 0048), and `apps/macroplan` draws
from `plan.schedule` as served. What the app imports from this package is the *ordering* and *estimate*
half — `railsOf` in `components/plan/canvas/view.ts`, and `railsOf`, `itemsByFeature`, `breakdown`,
`effectiveEstimate` and `sprintOf` in `components/plan/table/rows.ts`, plus `isWorkingDay` for a hover
— and it imports `schedule` itself nowhere. The prediction is deferred to phase 3, where an optimistic
drag has to answer before the round trip completes; the agreement test is still what will catch a
second implementation when it does.

That changes nothing about why this package is pure, and sharpens why it had to be: the browser needs
`railsOf` to be **the same total order the pass used**, which is the argument `@repo/canvas` repeats
when it refuses to re-derive it. A second consumer of the ordering arrived a phase before a second
consumer of the pass.

**`ScheduleEpic` turned out to be the narrowest shape in the product, and that was load-bearing rather
than incidental.** It is `{ id, railOrder }` — the forward pass never needed a hue — so the canvas had
to extend it to carry an epic's colour. Recorded here because the temptation on first reading is to add
`colour` to this package's input type, which would put a presentation field into `apps/api` and into
the agreement test for the benefit of a package neither imports. ADR 0055 refuses it for that reason.
