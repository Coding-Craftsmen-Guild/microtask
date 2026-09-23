import { can, type Principal } from '@repo/kernel'
import { schedule, type Cycle, type IgnoredEdge, type Span, type Unscheduled } from '@repo/schedule'
import type { PlanItem } from '../entities/item.js'
import type { PlanManifest, PlanShareLink } from '../entities/plan.js'

/** One feature or item on the axis, in working-day offsets from the first working day. */
export interface PlanSpan extends Span {
  readonly id: string
}

/**
 * A plan schedule as a response carries it: spans, cycles, unscheduled entries, dropped edges.
 *
 * `ScheduleResult.days` is a `Map` keyed by id, which does not survive `JSON.stringify`, so the
 * spans become an array that names its own ids. **Both** feature ids and item ids share that one
 * map, so this array carries both and a client tells them apart by looking the id up in the plan.
 */
export interface PlanScheduleView {
  readonly spans: readonly PlanSpan[]
  readonly cycles: readonly Cycle[]
  readonly unscheduled: readonly Unscheduled[]
  readonly ignoredEdges: readonly IgnoredEdge[]
}

interface PlanBody extends Omit<PlanManifest, 'shareLinks'> {
  readonly schedule: PlanScheduleView
}

/**
 * One plan as a particular caller may be told about it, with the schedule derived from it.
 *
 * `shareLinks` is optional because an admin-only block a caller is refused is **absent**, not empty:
 * one route tree serves an admin and a link holder alike (ADR 0013), so a plan handed to a link
 * principal must not carry a field only an admin may see — and an empty array is a different
 * sentence, one that says the plan has no seats. Every other field is the same for every principal
 * that may read the plan at all: a `view` holder and a `manage` holder see identical structure,
 * estimates and schedule.
 */
export interface PlanView extends PlanBody {
  readonly shareLinks?: readonly PlanShareLink[]
}

/**
 * One plan as a **list** describes it: its settings and three counts, never its contents.
 *
 * At this product's own bounds a list is 200 plans holding up to 2,000 items each, which is 400,000
 * items on the one screen that renders none of them. `shareLinkCount` is present exactly when
 * {@link PlanView} would have carried `shareLinks` — one decision, asked once, reused — so a caller
 * refused the links is refused their number too (ADR 0033).
 */
export interface PlanListItem {
  readonly id: string
  readonly name: string
  readonly startDate: string
  readonly sprintLengthDays: number
  readonly timezone: string
  readonly epicCount: number
  readonly featureCount: number
  readonly itemCount: number
  readonly shareLinkCount?: number
  readonly createdAt: string
  readonly updatedAt: string
}

/** One item with the description its own file holds. */
export interface ItemView extends PlanItem {
  readonly description: string
}

const compare = (left: string, right: string): number => {
  if (left === right) return 0
  return left < right ? -1 : 1
}

const bySpan = (left: PlanSpan, right: PlanSpan): number =>
  left.startDay - right.startDay || compare(left.id, right.id)

const byId = (left: Unscheduled, right: Unscheduled): number => compare(left.id, right.id)

const spansOf = (days: ReadonlyMap<string, Span>): readonly PlanSpan[] =>
  [...days]
    .map(([id, span]) => ({ id, startDay: span.startDay, endDay: span.endDay }))
    .sort(bySpan)

/**
 * The schedule of one plan, flattened and ordered so two callers reading it agree byte for byte.
 *
 * Sorting is what makes this view deterministic, and that is load-bearing rather than tidy: `days`
 * is a `Map`, so its iteration order is the order the forward pass happened to place things in, and
 * a response ordered by an implementation detail of a traversal is one an agreement test between
 * this package and the wire cannot pin. `(startDay, id)` gives spans a total order — ties on a day
 * are common, since every rail starts at day 0 — and `unscheduled` sorts by id, which is the order
 * the pass already produces and is restated here so the order is this view's promise rather than
 * something inherited. `cycles` and `ignoredEdges` are passed through as they came: `findCycles`
 * sorts ids within a cycle and cycles by first id, and the pass sorts dropped edges by
 * `(featureId, dependsOnId)`.
 *
 * Exported from this module and deliberately **not** from the package barrel, though
 * {@link PlanScheduleView} and {@link PlanSpan} are: no consumer has ever wanted the function —
 * `apps/api` and `apps/macroplan` take `planView` and read `PlanView['schedule']` off it, and the
 * only caller of this one is in this package. The reason to keep it that way is the agreement test in
 * `apps/api`, which asserts that the schedule a client receives equals `schedule()` from
 * `@repo/schedule` flattened by the test itself. This is the function the route already calls, so a
 * test reaching for it would compare a value to itself and could never fail; a barrel export puts
 * that mistake one import away.
 */
export function planSchedule(manifest: PlanManifest): PlanScheduleView {
  const result = schedule(manifest)
  return {
    spans: spansOf(result.days),
    cycles: result.cycles,
    unscheduled: [...result.unscheduled].sort(byId),
    ignoredEdges: result.ignoredEdges,
  }
}

/**
 * The share links this principal may be told about, or `undefined` when the block is refused.
 *
 * Asks the kernel's policy for `share:read` on the plan rather than restating who holds it: shaping
 * a response is a filter, and ADR 0009 requires a filter to ask the policy. Refusing answers
 * `undefined` and not an empty array, so a caller cannot read "this plan has no seats" out of "you
 * may not ask" — and, the other way, so a `view` holder is never handed every other holder's token,
 * which is a credential dump to a reader who needs none of them.
 *
 * One decision here where Microtask's `visibleLinks` makes two, and the difference is in the
 * entities rather than in the policy: a Microtask `ShareLink` carries its own scope, so each link is
 * asked about separately and a task-scoped `manage` holder sees only its own. A `PlanShareLink`
 * carries no scope — a plan is shared at plan scope and nothing narrower exists (ADR 0053) — so
 * there is no second question to ask, and inventing one would mean inventing a per-link scope.
 */
export function visibleLinks(
  manifest: PlanManifest,
  principal: Principal,
): readonly PlanShareLink[] | undefined {
  const target = { kind: 'plan', planId: manifest.id } as const
  return can(principal, 'share:read', target) ? manifest.shareLinks : undefined
}

/**
 * A plan with the schedule derived from it. Derived here, stored nowhere (spec §3.4).
 *
 * Shapes rather than gates: the one thing the principal decides is the share block, and the route's
 * own `authorize()` is what decides who reaches a plan at all (ADR 0009). So the contents below are
 * the plan's contents, not a filtered version of them — there is nothing to filter, because every
 * principal that gets this far holds `plan:read` on this plan.
 *
 * The fields are copied one by one rather than spread from the manifest, so a field added to
 * `PlanManifest` later does not reach a response by default: a view is the list of what a caller is
 * told, and the next field added to the stored shape should have to be put on that list on purpose.
 */
export function planView(manifest: PlanManifest, principal: Principal): PlanView {
  const body: PlanBody = {
    id: manifest.id,
    name: manifest.name,
    startDate: manifest.startDate,
    sprintLengthDays: manifest.sprintLengthDays,
    timezone: manifest.timezone,
    epics: manifest.epics,
    features: manifest.features,
    items: manifest.items,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    schedule: planSchedule(manifest),
  }
  const links = visibleLinks(manifest, principal)
  return links === undefined ? body : { ...body, shareLinks: links }
}

/** A plan as a list describes it: settings and counts, never contents. */
export function planListItem(manifest: PlanManifest, principal: Principal): PlanListItem {
  const row: PlanListItem = {
    id: manifest.id,
    name: manifest.name,
    startDate: manifest.startDate,
    sprintLengthDays: manifest.sprintLengthDays,
    timezone: manifest.timezone,
    epicCount: manifest.epics.length,
    featureCount: manifest.features.length,
    itemCount: manifest.items.length,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  }
  const links = visibleLinks(manifest, principal)
  return links === undefined ? row : { ...row, shareLinkCount: links.length }
}

/** One item with the description its own file holds. */
export function itemView(item: PlanItem, description: string): ItemView {
  return { ...item, description }
}
