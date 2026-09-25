import { LIMITS } from '@repo/contracts'
import { findCycles, type ScheduleFeature } from '@repo/schedule'
import { joinEdges } from './field'

/**
 * A feature as this module reads it: the graph `findCycles` walks, plus the name a refusal says.
 *
 * It **extends** `ScheduleFeature` rather than narrowing to the two fields the walk reads, because
 * `findCycles` takes that interface and a narrower shape would have to be widened at the call by
 * inventing an `epicId`, a `position`, an estimate and a pin — four values this module has no
 * business claiming. A `PlanFeature` satisfies it as it stands (`packages/contracts/src/plan.ts`),
 * so the caller hands over the plan's own features and nothing is rebuilt.
 */
export interface CycleFeature extends ScheduleFeature {
  /** The feature's stored name, which is what a refusal names it by rather than by its id. */
  readonly name: string
}

/**
 * What a dependency control will send for a set of edges, or the sentence it refuses with.
 *
 * The same two-state shape `EstimateEntry` and `PinEntry` have (`./field.ts`), for the same reason:
 * the value that goes out and the reason nothing does are one answer, so a caller cannot forget to
 * ask for the second.
 */
export type EdgeEntry =
  | { readonly kind: 'edges'; readonly dependsOn: readonly string[] }
  | { readonly kind: 'refused'; readonly detail: string }

/**
 * One row of a dependency editor: a feature this one could wait on, and what clicking it would do.
 *
 * Every member is a **primitive**, which is what makes this crossable: each row is drawn by a client
 * component, and a client component may be handed primitives, an unbound function or `null` and
 * nothing else (`../module-boundaries.test.tsx`). So the list of candidates never crosses — one row's
 * worth of strings does, once per row.
 *
 * **Both** refusals and no list. A row is drawn once and may be clicked twice, so which write a box
 * means is not fixed at render time, and a row carrying the one list its first click would send could
 * only ever answer that click — a second click on another box, sent before the re-render, replaced the
 * edge the first had just stored (`./edge-list.ts`). The list a click sends is built in the browser
 * from the subject's own stored list instead, which is {@link EdgeChoices}' `storedIds`, and what a row
 * carries is the two answers that list cannot be worked out from.
 */
export interface EdgeChoice {
  /** The candidate feature's own id, which is also what makes each row's control id unique. */
  readonly featureId: string

  /** The candidate's name, which is the control's label. */
  readonly name: string

  /** Why adding this candidate would be refused, or `''` when the local check has nothing to say. */
  readonly addRefusal: string

  /** Why removing it would be refused — a cycle the plan already holds refuses either — or `''`. */
  readonly removeRefusal: string
}

/**
 * The candidate list of one dependency editor: the subject's stored edges, and a row per candidate.
 *
 * `storedIds` is the subject's own `dependsOn` as this render found it, joined — one string, shipped
 * to each row, which is what every click's list is built from in the browser. It is answered here
 * rather than read off the features again by the caller, because it is the same read every row's
 * refusals were worked out against, and two readings of one list are a diff away from disagreeing.
 */
export interface EdgeChoices {
  /** The subject's stored list, joined (`joinEdges` in `./field.ts`); `''` for no edges. */
  readonly storedIds: string

  /** One row per **other** feature of the plan, in the plan's own order. */
  readonly rows: readonly EdgeChoice[]
}

const nameOf = (features: readonly CycleFeature[], id: string): string =>
  features.find((one) => one.id === id)?.name ?? id

const edgeTotal = (features: readonly CycleFeature[]): number =>
  features.reduce((running, each) => running + each.dependsOn.length, 0)

const stated = (features: readonly CycleFeature[], featureId: string): readonly string[] =>
  features.find((one) => one.id === featureId)?.dependsOn ?? []

/** Why a feature may not wait on itself, which the API refuses as a 422 and not as a cycle. */
export const SELF_EDGE = 'A feature cannot wait on itself.'

/**
 * The API's own sentence for a cycle, said over **names** instead of over ids.
 *
 * `assertAcyclic` throws `These features would wait on each other: <ids>` and the route answers it
 * as a 409 (`packages/macroplan-domain/src/services/feature-service.ts`). That detail never reaches
 * a reader: `lib/problem.ts` answers every refusal with the audience's plain sentence for the status
 * and never the API's, so a 409 arrives as "Someone else changed this at the same time" — true of a
 * lost write and false of a cycle. The wording is kept and the ids are replaced by the names on
 * screen, so the two halves of the product say the same thing in the terms each audience has.
 *
 * @param names - The features of one cycle, already in the order they should be read.
 * @returns The sentence to put in front of the user instead of sending the write.
 */
export const cycleSentence = (names: readonly string[]): string =>
  `These features would wait on each other: ${names.join(', ')}.`

/**
 * Why a write is refused for the plan-wide edge budget, naming the total and the cap.
 *
 * **The comparison is `>` and not `>=`, and that is the whole of it.** The service asks
 * `assertWithin('edgesPerPlan', total - 1)`, and `assertWithin` throws when what it is handed is
 * **already at** the bound — it answers "may one more be added". So the server refuses exactly when
 * `total - 1 >= LIMITS.edgesPerPlan`, which is when `total > LIMITS.edgesPerPlan`, and it serves the
 * write that leaves the plan holding the cap itself. A client comparing its total against the
 * constant with `>=` would refuse the last edge the API accepts — at exactly the cap, which is where
 * a cap is tested and where a user meets it.
 *
 * @param total - The number of edges the write would leave the **whole plan** holding.
 * @returns The sentence to show instead of sending it.
 */
export const tooManyEdges = (total: number): string =>
  `This plan would hold ${String(total)} dependencies, and ${String(LIMITS.edgesPerPlan)} is the limit across the whole plan. Remove one from another feature first.`

const proposedCycle = (
  features: readonly CycleFeature[],
  featureId: string,
  dependsOn: readonly string[],
): string | null => {
  const next = features.map((one) => (one.id === featureId ? { ...one, dependsOn } : one))
  const [first] = findCycles(next)
  if (first === undefined) return null
  return cycleSentence(first.featureIds.map((id) => nameOf(features, id)))
}

const refusalIn = (
  features: readonly CycleFeature[],
  featureId: string,
  edges: readonly string[],
  others: number,
): string => {
  if (edges.includes(featureId)) return SELF_EDGE
  const total = others + edges.length
  if (total > LIMITS.edgesPerPlan) return tooManyEdges(total)
  return proposedCycle(features, featureId, edges) ?? ''
}

const othersEdges = (features: readonly CycleFeature[], featureId: string): number =>
  edgeTotal(features) - stated(features, featureId).length

/**
 * What a dependency control will send for a proposed set of edges, or why it will send nothing.
 *
 * The three refusals the service has, asked in the service's own order — a self-edge, then the
 * plan-wide budget, then the cycle — so the sentence a user reads is the one the API would have
 * refused with first. The list is deduped before any of them, because the server stores
 * `[...new Set(dependsOn)]` and the budget counts what would be written.
 *
 * The fourth thing the service refuses is an id naming a feature that is not in this plan, and it is
 * absent here on purpose: a candidate list drawn from the plan's own features cannot produce one
 * (spec §8 records cross-plan dependencies as rejected), so a check for it would be a branch no
 * control can reach and no test can honestly exercise.
 *
 * ### The cycle question, which is the third and cannot be asked first
 *
 * It is asked about **the graph the write would leave and not about the edge being added**, because
 * that is what the server does: `setDependencies` builds the feature list it is about to save and
 * runs `findCycles` over all of it, so any cycle anywhere refuses the write. A plan whose stored
 * volume already holds one therefore refuses an edge between two features that have nothing to do
 * with it — stricter than "the cycle you just made", and a user not told so reads the editor as
 * broken. Only the **first** cycle is named, `findCycles` ordering them by first id: one is enough
 * to say why the write is refused, and a list of several would be a sentence about the plan's
 * storage rather than about the click.
 *
 * `findCycles` is the one walk, and there is deliberately no second one in this module: it is Tarjan
 * over the `dependsOn` graph, property-tested in `@repo/schedule`, and that package asserts its own
 * freedom from `node:` builtins and from dependencies (`packages/schedule/src/purity.test.ts`) so it
 * may be bundled for a browser. It also drops an edge naming a feature the plan does not hold, which
 * is why a dangling edge cannot produce a refusal naming something nobody can find on screen.
 *
 * **A self-edge reaches that walk as a cycle of one**, and asking it first is what keeps the
 * reciprocal sentence off a list of one name — `These features would wait on each other: Auth.` The
 * order is therefore a property of this function rather than a convention a caller must know: the
 * cycle question is not reachable from outside this module, so there is nowhere left to ask it out
 * of turn.
 *
 * @param features - Every feature of the plan, as stored.
 * @param featureId - The feature whose list is being replaced.
 * @param dependsOn - The list to send, before deduping.
 * @returns The deduped list to send, or the sentence to show instead.
 */
export function edgeEntry(
  features: readonly CycleFeature[],
  featureId: string,
  dependsOn: readonly string[],
): EdgeEntry {
  const edges = [...new Set(dependsOn)]
  const detail = refusalIn(features, featureId, edges, othersEdges(features, featureId))
  return detail === '' ? { kind: 'edges', dependsOn: edges } : { kind: 'refused', detail }
}

/**
 * One row per other feature of the plan: what it is called, whether this one waits on it, and both
 * answers the click needs.
 *
 * **The candidate list is this plan's features and never a search.** Spec §8 records cross-plan
 * dependencies as rejected and ADR 0050 is why — an id that names nothing in this plan is refused
 * rather than followed — so every candidate there could ever be is already in this argument. The
 * subject itself is left out, a self-edge being refused separately and so not a choice to offer.
 *
 * The whole cost of the design is paid here: for each candidate **both** lists a click on it could
 * send are put through the same three refusals {@link edgeEntry} asks, so a row carries its own two
 * refusals as strings and the graph never crosses into the browser. That is `findCycles` twice per
 * candidate — linear in features plus edges each time, against a plan capped at 200 features and 400
 * edges. The plan-wide edge total and this feature's own share of it are read **once** for the whole
 * list rather than once per candidate: neither changes between rows, the subject's stored list being
 * the one thing every row is built from. Nothing is deduped per row either, because the stored list is
 * already a set — the service writes `[...new Set(dependsOn)]` — and a candidate is only ever added
 * to a list that does not name it.
 *
 * @param features - Every feature of the plan, as stored.
 * @param featureId - The feature the drawer is open on.
 * @returns The subject's stored list and one {@link EdgeChoice} per other feature, in the plan's own
 * order, or no rows at all when the plan does not hold this feature.
 */
export function edgeChoices(features: readonly CycleFeature[], featureId: string): EdgeChoices {
  const subject = features.find((one) => one.id === featureId)
  if (subject === undefined) return { rows: [], storedIds: '' }
  const own = subject.dependsOn
  const waits = new Set(own)
  const others = othersEdges(features, featureId)
  return {
    rows: features
      .filter((one) => one.id !== featureId)
      .map((one) => ({
        addRefusal: refusalIn(features, featureId, waits.has(one.id) ? own : [...own, one.id], others),
        featureId: one.id,
        name: one.name,
        removeRefusal: refusalIn(features, featureId, own.filter((id) => id !== one.id), others),
      })),
    storedIds: joinEdges(own),
  }
}
