import type { Plan } from '@repo/api-client'
import { treatmentsOf } from '@repo/canvas'
import type { Treatment } from '@repo/canvas'
import { breakdown, effectiveEstimate, itemsByFeature, railsOf, sprintOf } from '@repo/schedule'
import type { ScheduleFeature, ScheduleItem, Span } from '@repo/schedule'
import { railNames } from '../canvas/view'

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
 * - `honoured` — the named feature was placed, and this feature starts no earlier than its end.
 * - `set-aside` — named in `ignoredEdges`: rail order and this edge contradicted each other, rail
 *   order won, and the edge was dropped rather than discarded silently.
 * - `unknown` — the id names no feature in this plan, so there was never anything to wait for.
 * - `unplaced` — the named feature exists and got no span, so it could contribute no date.
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

  readonly feature: string

  readonly item: string | null

  readonly estimate: string

  readonly sprint: string

  readonly treatment: Treatment

  /** Every dependency the feature states, or nothing at all on an item row. */
  readonly blockedBy: readonly BlockedBy[]
}

interface Rows {
  readonly plan: Plan
  readonly items: ReadonlyMap<string, readonly ScheduleItem[]>
  readonly spans: ReadonlyMap<string, Span>
  readonly treatments: ReadonlyMap<string, Treatment>
  readonly epics: ReadonlyMap<string, string>
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
}

const days = (count: number): string => `${String(count)}d`

const signed = (delta: number): string => (delta < 0 ? days(delta) : `+${days(delta)}`)

const edgeKey = (featureId: string, dependsOnId: string): string => `${featureId} ${dependsOnId}`

const edgeState = (featureId: string, dependsOnId: string, rows: Rows): EdgeState => {
  if (rows.setAside.has(edgeKey(featureId, dependsOnId))) return 'set-aside'
  if (!rows.features.has(dependsOnId)) return 'unknown'
  return rows.spans.has(dependsOnId) ? 'honoured' : 'unplaced'
}

const edgesOf = (feature: ScheduleFeature, rows: Rows): readonly BlockedBy[] =>
  feature.dependsOn.map((id) => ({
    id,
    name: rows.features.get(id) ?? id,
    state: edgeState(feature.id, id, rows),
  }))

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

const featureRow = (feature: ScheduleFeature, rows: Rows): TableRow => ({
  id: feature.id,
  kind: 'feature',
  epic: rows.epics.get(feature.epicId) ?? UNCLAIMED,
  feature: rows.features.get(feature.id) ?? feature.id,
  item: null,
  estimate: estimateOf(feature, rows.items.get(feature.id) ?? []),
  sprint: sprintOfRow(feature.id, rows),
  treatment: rows.treatments.get(feature.id) ?? 'solid',
  blockedBy: edgesOf(feature, rows),
})

const itemRow = (item: ScheduleItem, feature: ScheduleFeature, rows: Rows): TableRow => ({
  id: item.id,
  kind: 'item',
  epic: rows.epics.get(feature.epicId) ?? UNCLAIMED,
  feature: rows.features.get(feature.id) ?? feature.id,
  item: rows.itemNames.get(item.id) ?? item.id,
  estimate: item.estimateDays === null ? NO_ESTIMATE : days(item.estimateDays),
  sprint: sprintOfRow(item.id, rows),
  treatment: rows.treatments.get(item.id) ?? 'solid',
  blockedBy: [],
})

const context = (plan: Plan): Rows => ({
  plan,
  items: itemsByFeature(plan),
  spans: new Map(plan.schedule.spans.map((span) => [span.id, span])),
  treatments: treatmentsOf(plan.schedule),
  epics: railNames(plan),
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
 * `railLayout` and `itemsToMarks` walk. `railsOf` states why that matters: "a second total order
 * written in this package could disagree with the first on any tie — which is a bar drawn on the
 * wrong rail, silently, at exactly the zoom level nobody tested." A table ordered by a sort of its
 * own would put its rows in an order the bars are not in, which is the one thing that makes two
 * renderings of one plan impossible to check against each other by eye.
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
 * The conflict list phase 3 brings — spec §6 — is where a plan's unreachable parts are reported, and
 * `UnplacedFeatures` makes the same argument for what falls off the gutter.
 *
 * @param plan - The plan and the schedule derived from it, exactly as `GET /plans/{planId}` answered.
 * @returns One row per feature and per item, features before their own items.
 */
export function tableRows(plan: Plan): readonly TableRow[] {
  const rows = context(plan)
  return railsOf(plan).flatMap((rail) =>
    rail.flatMap((feature) => [
      featureRow(feature, rows),
      ...(rows.items.get(feature.id) ?? []).map((item) => itemRow(item, feature, rows)),
    ]),
  )
}
