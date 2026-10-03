import { treatmentsOf } from '@repo/canvas'
import type { Treatment } from '@repo/canvas'
import { breakdown, effectiveEstimate, itemsByFeature, railsOf, sprintOf } from '@repo/schedule'
import type { ScheduleFeature, ScheduleItem, Span } from '@repo/schedule'
import { memoOnPlan } from '../store/memo-on-plan'
import { railNames } from '../canvas/view'
import { edgesOf, edgeKey } from './row-edges'
import { searchOf, sortOf, type TableSort } from './row-keys'
import type { PlanScreenModel } from '../plan-screen-model'

/**
 * What the forward pass did with one dependency a feature states.
 *
 * Four states rather than two, because `dependsOn` is not the same question as "is this honoured".
 * `ignoredEdges` names only the edges the pass **dropped to keep rail order** — `schedule()` is
 * explicit that "an edge to an unknown id, a cycle member or an unestimated feature is ignored and is
 * **not** reported in `ignoredEdges`: it could contribute no date, and `cycles` and `unscheduled`
 * already say why". A table that read `ignoredEdges` alone would therefore print a bare dependency
 * name for three different situations in which nothing whatever waited on anything, which is the one
 * thing `IgnoredEdge`'s own contract says a renderer must not do: "a canvas that could not tell 'this
 * bar ignores a dependency' from 'this bar could not be placed' would have to guess which sentence to
 * show."
 *
 * - `honoured` — the named feature got a span, and the pass reported no edge dropped between the two.
 * - `set-aside` — named in `ignoredEdges`: rail order and this edge contradicted each other, rail
 *   order won, and the edge was dropped rather than discarded silently.
 * - `unknown` — the id names no feature in this plan, so there was never anything to wait for.
 * - `unplaced` — the named feature exists and got no span, so it could contribute no date.
 *
 * `honoured` is **membership in `spans` and an absence from `ignoredEdges`, and nothing more**. It
 * deliberately does not check that this feature starts no earlier than its dependency ends, which an
 * earlier wording of this list claimed: that comparison would be a second opinion about a plan the
 * forward pass has already scheduled, and re-deriving a scheduling decision on the client is the
 * mistake `railLayout` names in `tableRows`' own note below. The state says what the schedule
 * **reports**, not what a recomputation here would conclude.
 *
 * One consequence is worth stating rather than discovering. When the **declaring** feature is itself
 * unplaced — unestimated, or in a cycle — `relax` never gets to its edges, so they reach neither
 * `ignoredEdges` nor anything else, and they read `honoured` here while that same row's sprint cell
 * reads `not placed`. Nothing waited on anything, and the column that owns the question says so;
 * `rows.test.ts` pins the pair, so a later reading of `honoured` cannot quietly change what a row
 * claims about itself.
 */
export type EdgeState = 'honoured' | 'set-aside' | 'unknown' | 'unplaced'

/** One dependency a feature states: the id, the name it resolves to, and what became of it. */
export interface BlockedBy {
  readonly id: string

  /** The named feature's own name, or the raw id when this plan holds no such feature. */
  readonly name: string

  readonly state: EdgeState
}

/**
 * One row of the table: a feature, or one item flowing under one.
 *
 * Every column is a **string decided here** rather than in the component, so that the wording §3.2
 * and §5 fix is asserted in a test that needs no DOM, and so the `.tsx` that renders a row is only
 * cells. `treatment` is the canvas's own `Treatment` and is carried on the row as `data-treatment`
 * for the reason `PreviewRow` carries `data-outcome`: two rows may legitimately render the same
 * words, and a test must not pass because of that.
 *
 * `item` is `null` on a feature row — not `''` and not a dash — because the cell is then about
 * nothing rather than about something empty, and only one of the two is a fact a test can assert.
 */
export interface TableRow {
  /** The feature id or the item id, which is also what `row-${id}` is keyed on. */
  readonly id: string

  readonly kind: 'feature' | 'item'

  /** Its rail's epic's name, or the same words the canvas draws for a rail no epic claims. */
  readonly epic: string

  /**
   * The same rail as an id. **Nothing draws it** — it lands as `data-rail` and the filter matches on it.
   *
   * An id rather than the name beside it, for the reason {@link TableRow.labelId} is an id: two rails may
   * not share a name in practice and nothing stops them, so filtering on the name would be a control that
   * sometimes showed two rails at once and never said which.
   */
  readonly railId: string

  readonly feature: string

  readonly item: string | null

  /**
   * The group this row's feature is in, or `null` for one in no group.
   *
   * The group's **name** and not its id, because this is a cell somebody reads. An item row carries its
   * feature's group rather than nothing, for the reason the epic and feature cells are repeated on every
   * row: a reader landing mid-table has no way to ask which phase a line belongs to, and a group whose
   * point is that its work is spread over rails is exactly the thing that cannot be inferred from
   * position.
   */
  readonly group: string | null

  /**
   * The same group as an id, or `null`. **Nothing reads it as a value** — it lands as `data-label-id`.
   *
   * Carried beside the name because the two are different jobs: the name is a cell, and the id is what the
   * one CSS rule per group generated by `labels/group-css.ts` matches on, so choosing a group dims the rows
   * that are not in it exactly as it dims the bars. Two groups may not share a name in practice but nothing
   * stops them, so dimming on the name would be a selector that sometimes lit two phases.
   */
  readonly labelId: string | null

  readonly estimate: string

  readonly sprint: string

  readonly treatment: Treatment

  /** Every dependency the feature states, or nothing at all on an item row. */
  readonly blockedBy: readonly BlockedBy[]

  /**
   * The id of the feature this row belongs to — its own, on a feature row.
   *
   * A **block** is a feature and the items under it, and it is the unit the toolbar works in: a filter
   * keeps or drops a whole block, and a sort moves one without ever separating an item from the feature
   * it flows under. Nothing draws it; it lands as `data-block`.
   */
  readonly block: string

  /**
   * Everything this row can be found by, already lower-cased.
   *
   * Pre-lowered by the server because the alternative is lower-casing two thousand strings on every
   * keystroke — the same trade `sidebar/sidebar-rows.ts` makes with `data-search`, and the reason both
   * match with `includes` rather than a regular expression.
   *
   * An item row carries its **feature's** name as well as its own, for the reason the epic and feature
   * cells are repeated on every row: somebody searching for a line of work means the whole of it.
   */
  readonly search: string

  /** What this block is ordered by, or `null` on an item row. See {@link TableSort}. */
  readonly sort: TableSort | null
}

interface Rows {
  readonly plan: PlanScreenModel
  readonly items: ReadonlyMap<string, readonly ScheduleItem[]>
  readonly spans: ReadonlyMap<string, Span>
  readonly treatments: ReadonlyMap<string, Treatment>
  readonly epics: ReadonlyMap<string, string>
  readonly labels: ReadonlyMap<string, string>
  readonly features: ReadonlyMap<string, string>
  readonly itemNames: ReadonlyMap<string, string>
  readonly setAside: ReadonlySet<string>
}

const UNCLAIMED = 'Unclaimed rail'

const NO_ESTIMATE = 'no estimate'

const NOT_PLACED: Readonly<Record<Treatment, string>> = {
  solid: 'not placed',
  hollow: 'not placed · no estimate',
  contradicted: 'not placed · in a dependency cycle',
  done: 'not placed',
  started: 'not placed',
}

const days = (count: number): string => `${String(count)}d`

const signed = (delta: number): string => (delta < 0 ? days(delta) : `+${days(delta)}`)

const estimateOf = (feature: ScheduleFeature, items: readonly ScheduleItem[]): string => {
  const pair = breakdown(feature, items)
  if (pair !== null && pair.delta !== 0) {
    return `planned ${days(pair.planned)} · broken down to ${days(pair.brokenDown)} · ${signed(pair.delta)}`
  }
  const effective = effectiveEstimate(feature, items)
  return effective === null ? NO_ESTIMATE : days(effective)
}

const sprintOfRow = (id: string, rows: Rows): string => {
  const span = rows.spans.get(id)
  if (span === undefined) return NOT_PLACED[rows.treatments.get(id) ?? 'solid']
  const from = sprintOf(span.startDay, rows.plan)
  const to = sprintOf(Math.max(span.startDay, span.endDay - 1), rows.plan)
  return from === to ? `S${String(from + 1)}` : `S${String(from + 1)}–S${String(to + 1)}`
}

const groupIdOf = (featureId: string, rows: Rows): string | null =>
  rows.plan.features.find((each) => each.id === featureId)?.labelId ?? null

interface Shared {
  readonly epic: string
  readonly railId: string
  readonly feature: string
  readonly group: string | null
  readonly labelId: string | null
  readonly block: string
}

const sharedOf = (feature: ScheduleFeature, rows: Rows): Shared => {
  const labelId = groupIdOf(feature.id, rows)
  return {
    epic: rows.epics.get(feature.epicId) ?? UNCLAIMED,
    railId: feature.epicId,
    feature: rows.features.get(feature.id) ?? feature.id,
    group: rows.labels.get(labelId ?? '') ?? null,
    labelId,
    block: feature.id,
  }
}

const featureRow = (feature: ScheduleFeature, rows: Rows): TableRow => {
  const shared = sharedOf(feature, rows)
  return {
    ...shared,
    id: feature.id,
    kind: 'feature',
    item: null,
    estimate: estimateOf(feature, rows.items.get(feature.id) ?? []),
    sprint: sprintOfRow(feature.id, rows),
    treatment: rows.treatments.get(feature.id) ?? 'solid',
    blockedBy: edgesOf(feature, rows),
    search: searchOf([shared.epic, shared.feature, shared.group]),
    sort: null,
  }
}

const itemRow = (item: ScheduleItem, feature: ScheduleFeature, rows: Rows): TableRow => {
  const shared = sharedOf(feature, rows)
  const name = rows.itemNames.get(item.id) ?? item.id
  return {
    ...shared,
    id: item.id,
    kind: 'item',
    item: name,
    estimate: item.estimateDays === null ? NO_ESTIMATE : days(item.estimateDays),
    sprint: sprintOfRow(item.id, rows),
    treatment: rows.treatments.get(item.id) ?? 'solid',
    blockedBy: [],
    search: searchOf([shared.epic, shared.feature, name, shared.group]),
    sort: null,
  }
}

const sorted = (feature: ScheduleFeature, rows: Rows): TableRow => {
  const row = featureRow(feature, rows)
  return { ...row, sort: sortOf(feature, rows, row) }
}

const rowsOf = (plan: PlanScreenModel, rows: Rows): readonly TableRow[] =>
  railsOf(plan).flatMap((rail) =>
    rail.flatMap((feature) => [
      sorted(feature, rows),
      ...(rows.items.get(feature.id) ?? []).map((item) => itemRow(item, feature, rows)),
    ]),
  )

const context = (plan: PlanScreenModel): Rows => ({
  plan,
  items: itemsByFeature(plan),
  spans: new Map(plan.schedule.spans.map((span) => [span.id, span])),
  treatments: treatmentsOf(plan.schedule),
  epics: railNames(plan),
  labels: new Map(plan.labels.map((label) => [label.id, label.name])),
  features: new Map(plan.features.map((feature) => [feature.id, feature.name])),
  itemNames: new Map(plan.items.map((item) => [item.id, item.name])),
  setAside: new Set(plan.schedule.ignoredEdges.map((edge) => edgeKey(edge.featureId, edge.dependsOnId))),
})

/**
 * Every row the table renders: each rail's features in derived order, each feature followed by its
 * own items.
 *
 * ### The order is the canvas's, and is not derived a second time
 *
 * `railsOf` and `itemsByFeature` come from `@repo/schedule` and are the same two functions
 * `railLayout` and `itemsToMarks` walk. `railsOf` is exported for exactly that, in its own words:
 * "so `@repo/canvas` can draw against the exact order the forward pass placed spans in, rather than
 * re-deriving a total order that a second package's tests cannot check against the first's — a
 * mismatch there is a bar drawn on the wrong rail" (`packages/schedule/src/derived-order.ts`).
 * `railLayout` is where what such a mismatch costs is written out: "a second total order written in
 * this package could disagree with the first on any tie — which is a bar drawn on the wrong rail,
 * silently, at exactly the zoom level nobody tested" (`packages/canvas/src/rails.ts`). A table ordered
 * by a sort of its own would put its rows in an order the bars are not in, which is the one thing that
 * makes two renderings of one plan impossible to check against each other by eye.
 *
 * Names are **joined back to the plan**, because the derived order answers `ScheduleFeature` and
 * `ScheduleItem` — the forward pass's own shapes, which carry ids, positions and estimates and no
 * names. `railNames` is the canvas's own epic join, imported rather than rewritten, so an unclaimed
 * rail is named in one place; `Rail` draws the same words for it.
 *
 * ### What gets a row, which is deliberately more than the canvas draws
 *
 * Every feature and every item the derived order reaches, placed or not. That is a **superset** of
 * what the canvas draws: it draws a bar per placed feature, a mark per placed item and a gutter stub
 * per unplaced feature, and it draws **nothing at all** for an unestimated item under a placed
 * feature — `writeItems` leaves that item out of `spans`, so `itemsToMarks` produces no mark and
 * `ItemMarkShape`'s own note confirms no mark can ever be hollow. An item invisible on the canvas is
 * exactly what §5 wants the table for: it "is also the fastest way to audit a plan someone else
 * drew", and a rendering that omitted the same work the picture omits could not be that.
 *
 * An item whose `featureId` names no feature in the plan gets no row, and that absence is the same
 * one the canvas has: `itemsByFeature` groups it under an id "simply never asked for", and the
 * forward pass places it in "neither `days` nor `unscheduled`". Nothing here can name the rail or the
 * feature such a row would belong to, and inventing one would be a claim about where the work sits.
 * Spec §6 names the conflict list for **cycles** — "a cycle that arrives some other way … is reported
 * by `schedule()` and shown in the conflict list rather than breaking the page" — and says nothing
 * about an item naming no feature; that the same list is where this belongs is an inference, and it
 * is the one `UnplacedFeatures` already draws for what falls off the gutter.
 *
 * ### One derivation per plan, not one per caller
 *
 * It is memoised on the plan object (`../store/memo-on-plan.ts`). Several callers want the same rows on
 * one render — `PlanTable`, which draws every one of them, the hover cards (`../canvas/detail-lines.ts`),
 * and the drawer, which finds one among them so that a panel cannot word an estimate the table worded
 * differently — and every one of them is handed the one object the plan store holds, so they meet the same
 * entry. It used to be React's `cache()`, which memoises for one server request; the screen is drawn in
 * the browser now (ADR 0069), where `cache()` is a pass-through, and the store's object identity is the
 * better key anyway: it changes exactly when the plan does.
 *
 * It is memoised **here** rather than beside a read, because this function is the only thing the callers
 * share, and wrapping the pure function leaves each call site reading as what it is, `tableRows(plan)`.
 *
 * **No test here can demonstrate that**, and the reason is worth stating rather than discovering.
 * React ships two builds, and outside the `react-server` condition `cache` is `function (fn) { return
 * function () { return fn.apply(null, arguments) } }` — a pass-through holding nothing
 * (`node_modules/react/cjs/react.development.js`), and that is the build vitest resolves. So the cases
 * below pin this function's **answers**, a test asserting one derivation would pass against a
 * pass-through and prove nothing, and the sharing itself rests on the same request-scoped store
 * `readPlan` rests on — whose own tests count two reads for exactly this reason.
 *
 * ### This file, if it grows
 *
 * Four concerns share it — the derived walk, the four edge states, §3.2's estimate wording and the
 * sprint label — and that is deliberate while it sits well under the 150-line cap with every function
 * pure and directly tested. If phase 3's conflict list or phase 4's progress column pushes it near
 * the cap, the split is the answer, and it splits by **column** rather than by row kind: a feature
 * row and an item row must keep answering the same seven questions in one place.
 *
 * @param plan - The plan and the schedule derived from it, as `GET /plans/{planId}` answered it minus
 * the seats: a `PlanScreenModel`, which is the floor for everything under `components/plan` rather
 * than a ceiling on the one component that used to be the only way in.
 * @returns One row per feature and per item, features before their own items.
 */
export const tableRows = memoOnPlan((plan: PlanScreenModel): readonly TableRow[] => rowsOf(plan, context(plan)))
