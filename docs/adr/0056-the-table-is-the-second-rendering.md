# ADR 0056 — The table is the second rendering of a plan, not the accessible fallback

**Status:** Accepted · 2026-09-23

## Context

Spec §5 asks for two renderings of one plan and gives the reason twice over: "A **table view** is a
first-class second rendering of the same data, not an afterthought: epic, feature, item, estimate,
sprint, progress, blocked-by. An SVG-only plan is unreadable to a screen reader, and the table is also
the fastest way to audit a plan someone else drew."

Two claims sit in that sentence and they pull in different directions. *Unreadable to a screen reader*
invites a fallback: build the picture, then add a table for the readers who cannot see it. *The fastest
way to audit a plan someone else drew* invites a peer: the table is how a sighted admin checks the
work, so it has to be as complete as the canvas and reachable without pretending to need help. A
fallback decays, because nothing renders it in the ordinary course of work and nobody notices when it
falls a release behind the picture.

The constraint that decides how far this can be enforced: **there is no accessibility tooling in this
repository at all.** No `eslint-plugin-jsx-a11y`, no `axe`, no `jest-axe` or `vitest-axe` — not in any
`package.json`, not in any eslint config, and not transitively either: `pnpm-lock.yaml` contains
neither string. Next 16 removed `next lint`, so not even `eslint-config-next`'s bundled a11y rules are
in the graph (ADR 0027). So nothing automated will tell anyone that the table left the accessibility
tree. Whatever holds it honest has to be an assertion somebody wrote on purpose.

## Decision

**The table is a peer of the canvas, and a data-parity test is what keeps it one.** `PlanScreen`
renders both, always, and `plan-table.test.tsx` asserts that every id the canvas emits an element for
has a row.

**The parity test scrapes the canvas rather than comparing against a fixture.** Its central case
renders `PlanCanvas` across three plan shapes — a healthy plan, one with an unestimated feature, one
with a feature in a cycle — collects `[data-feature-id], [data-item-id]` and `[data-placed="false"]`
out of the rendered SVG, then renders `PlanTable` on the same plan and requires a row for each
collected id. It is named for what that buys: *"names every id the canvas actually emits an element
for, bars, marks and stubs alike"*. A list of expected ids in the test file would have to be edited
whenever the canvas learned to draw something new, and the failure mode of forgetting is a green
suite; scraping the canvas's own output cannot fall behind it. Two narrower cases sit beside it and
drive the comparison from `railLayout` and `itemsToMarks` directly, so a canvas that stopped emitting
attributes altogether fails those rather than passing this one vacuously — which is also why the
scraping case asserts `drawn.length` is greater than two before it compares anything.

**The table is a superset of the canvas, deliberately.** It gets a row for every feature and every
item the derived order reaches, placed or not. The canvas draws a bar per placed feature, a mark per
placed item and a gutter stub per unplaced feature, and it draws **nothing whatever** for an
unestimated item under a placed feature: the pass leaves that item out of `spans`, so `itemsToMarks`
produces no mark. `rows.ts` records why the table must still show it — §5's table "is also the fastest
way to audit a plan someone else drew", and a rendering that omitted the same work the picture omits
could not be that — and `plan-table.test.tsx` pins the case by name: *"names an unplaced feature's own
items too, which the canvas draws nothing whatever for"*, asserting the row exists and carries
`data-treatment="hollow"`. The one thing that gets no row is an item whose `featureId` names no feature
in the plan, because nothing here could name the rail or the feature such a row would sit under.

**The view switch rejected the vendored Radix tabs primitive.** `@repo/ui`'s `src/components/tabs.tsx`
is `'use client'` over Radix's `Tabs`. Its `TabsContent` computes `present = forceMount || isSelected`
and renders through `Presence` with `hidden: !present` (`@radix-ui/react-tabs@1.1.21`), so the
unselected panel is **either unmounted or carrying the `hidden` attribute** — and out of the
accessibility tree in each case. That is fine for two panels of equivalent content and wrong here,
because the two panels are not equivalent: one of them is the only rendering a screen reader can read.
A switch built on it would remove the table from the tree at exactly the moment the timeline is shown.

The switch is therefore **two native `<input type="radio">` and their labels, styled with Tailwind
`peer-*` variants**. The browser owns the selected state, so `PlanScreen` stays a Server Component,
there is no client boundary and nothing hydrates. The asymmetry between the two panels is the decision
inside the decision: the canvas panel is `peer-checked/table:hidden` — `display: none`, which costs a
screen reader one `role="img"` label and nothing else — while the table panel is
`peer-checked/timeline:sr-only`, off screen and **still in the tree**. A reader is never told to switch
views to reach the only rendering it can read.

`PlanScreen` records what that costs and does not round it down: the table's markup is always sent,
2,200 rows at this product's caps of 200 features and 2,000 items, and a reader hears both renderings
at once. The second is the point rather than a defect. It also records what the structure may not
claim — the radios and both panels are siblings under one flex parent, because `peer-*` is a sibling
selector, so nothing here is a `<fieldset>` and nothing claims `role="radiogroup"`: "the only element
containing both radios also contains both panels, and calling that a radio group would be false." What
the radios share instead is one `aria-describedby` pointing at an `sr-only` sentence.

**`blocked-by` has four states, not two.** `rows.ts` declares
`EdgeState = 'honoured' | 'set-aside' | 'unknown' | 'unplaced'`, and the reason is a sentence in
`schedule()`'s own contract: an edge "to an unknown id, a cycle member or an unestimated feature is
ignored and is not reported in `ignoredEdges`: it could contribute no date, and `cycles` and
`unscheduled` already say why" (`packages/schedule/src/forward-pass.ts`). A table that read
`ignoredEdges` alone would therefore print a bare dependency name for three different situations in
which nothing waited on anything — the failure `@repo/contracts`' `IgnoredEdge` names: "a canvas that
could not tell 'this bar ignores a dependency' from 'this bar could not be placed' would have to guess
which sentence to show." So `set-aside` is membership in `ignoredEdges`, `unknown` is an id this plan
holds no feature for, `unplaced` is a named feature with no span, and `honoured` is membership in
`spans` with an absence from `ignoredEdges` **and nothing more** — deliberately not a check that this
feature starts after its dependency ends, which would be a second opinion about a plan the forward
pass has already scheduled.

**`progress` is absent on purpose, and the absence is stated in a visible `<caption>`.** §5 names seven
columns; six are rendered. §7.2 fixes what a progress number may be — "an item's percentage is the
linked task's `{ done, total }`. An unlinked item has a manual status only — not a manual percentage —
so a number on screen is always a counted number" — and nothing is linked in phase 2: `linkedTaskId`
is reserved on every item and is `null`, and §9 puts derived progress in phase 4 with the Microtask
bridge. The three available choices were a column of 2,000 identical dashes, an invented number, or
leaving it out and saying so where an admin auditing the plan reads it. The `<caption>` is that third
choice: *"No progress column yet: a percentage here is only ever counted from a linked Microtask task,
and the bridge that links one is phase 4."* Phase 4 adds the column and deletes the caption.

## Consequences

- **Role-based assertions are the entire accessibility mechanism**, so they are written as though
  nothing else exists. `plan-table.test.tsx` reaches the table only through
  `getByRole('table', { name })`, asserts `scope` on every header cell, and pins the two accessible
  names against each other in one render — `Timeline of Atlas rollout` as a `role="img"` and
  `Table of Atlas rollout` as a `table` — so the two renderings of one plan are told apart by what
  they are rather than by which comes first in the document.
- **The table's accessible name is an `aria-label` and not the caption**, because a caption paired
  with an `aria-label` loses the name computation and some readers then skip it. The caption is for a
  sighted auditor; the label is what is guaranteed to be announced.
- **Two renderings mean two places a column's wording lives, so the wording lives in neither
  component.** `tableRows` decides every cell as a string, which is what lets §3.2's estimate wording
  and §5's sprint labels be asserted in `rows.test.ts` with no DOM at all, and leaves `table-row.tsx`
  as cells. The row also carries the canvas's own `Treatment` as `data-treatment`, so a test cannot
  pass merely because two rows legitimately render the same words.
- **The parity test constrains the canvas as much as the table.** Its ids come from
  `data-feature-id`, `data-item-id` and `data-placed`, so those attributes are now load-bearing
  contract rather than test convenience, and removing one breaks parity rather than one assertion.
- **Ordering is `railsOf` and `itemsByFeature` in both renderings**, never a sort of the table's own.
  A table ordered differently from the bars is the one thing that would make two renderings of one
  plan impossible to check against each other by eye — and re-deriving the order is the failure
  `packages/canvas/src/rails.ts` describes as "a bar drawn on the wrong rail, silently, at exactly the
  zoom level nobody tested".
- **The switch has no JavaScript, so it has no controlled state to get wrong**, and equally no way to
  remember a choice across navigations. Nobody has asked for one; a phase that wants it is choosing a
  client boundary and should say so.
- **`rows.ts` has a stated split line for when it grows.** Four concerns share the file under the
  150-line cap, and if phase 3's conflict list or phase 4's progress column pushes it over, it splits
  **by column** and not by row kind, so a feature row and an item row keep answering the same
  questions in one place.

## Alternatives considered

**Build the switch on `@repo/ui`'s vendored tabs.** The primitive exists, it is already in the design
system, and it gives keyboard semantics for free. Rejected on the measured behaviour of
`@radix-ui/react-tabs@1.1.21`: `present = forceMount || isSelected` and `hidden: !present` means the
unselected panel is unmounted or `hidden`, and either way the table leaves the accessibility tree
whenever the timeline is selected. `forceMount` would keep it mounted and still `hidden`, which is the
same outcome. It would also make this whole screen a client component for a choice the browser can
make natively.

**Hide the table with `display: none` the way the canvas is hidden.** Symmetrical, cheaper markup, and
it is what a tab component does. Rejected for the asymmetry that is the point of this record: hiding
the canvas costs a reader one label, and hiding the table costs a reader the plan.

**Render the table only when it is selected.** Smaller payload — 2,200 rows are not free — and the
obvious optimisation. Rejected: it is the Radix behaviour with a different implementation, and the
payload is the price of the guarantee. If it ever becomes a real problem, the answer is fewer rows
through pagination that both renderings share, not a table that exists conditionally.

**Make the table a genuine fallback, offered behind a "screen reader version" link.** Honest about
which audience it is for, and it keeps the default page small. Rejected on §5 and on how software
rots: a rendering nobody uses in the ordinary course of work falls behind the one everybody uses, and
separating the audiences is what removes the pressure that keeps them in step. The parity test only
means something because both renderings are on the same page for the same people.

**Show `blocked-by` as a bare list of the names in `dependsOn`.** One column, no states, nothing to
explain. Rejected: three distinct situations in which nothing waited on anything would then print
exactly like a dependency that was honoured, which is the confusion `IgnoredEdge`'s own contract
forbids a renderer from creating.

**Derive `honoured` by checking that a feature starts no later than its dependency ends.** It reads
like the stronger check, and an earlier wording of the four states claimed it. Rejected: it is a second
opinion about a plan the forward pass has already scheduled, and re-deriving a scheduling decision on
the client is the same mistake as re-deriving a rail order. The state says what the schedule
**reports**; `rows.test.ts` pins the one case where that shows — an unplaced feature's own edges read
`honoured` while the same row's sprint cell reads `not placed`, because `relax` never reached them.

**Ship a `Progress` column of dashes, or a percentage counted from the schedule.** The first keeps §5's
seven columns literally intact; the second puts a number on screen. Rejected together: a column of
2,000 identical dashes is a promise the product cannot keep, and a percentage derived from spans rather
than from a linked task's `{ done, total }` would be exactly the manual percentage §7.2 refuses.

**Add `eslint-plugin-jsx-a11y` or an `axe` assertion as part of this work.** It would turn some of the
above into an automated check. Rejected as out of scope for a rendering task rather than on the merits
— it is a workspace-wide lint regime and an ADR of its own, and adopting it in one app's test file
would leave the other app and every `@repo/ui` component unchecked while implying otherwise. Recorded
here so that the next person to reach for one knows the absence was noticed rather than overlooked.
