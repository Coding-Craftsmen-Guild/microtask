import type { Unscheduled, UnscheduledReason } from '@repo/schedule'
import type { CanvasSchedule } from './plan.js'

/**
 * How a mark is drawn, which is a statement about its schedule and never about its epic.
 *
 * Spec §5 (`docs/superpowers/specs/2026-09-22-macroplan-design.md`) gives hue to the epic and
 * treatment to status — "**Epic owns hue. Status owns treatment.** Both point 6 (per-epic colours)
 * and point 10 (red/green status) wanted hue, and hue cannot carry two meanings… The result
 * survives greyscale and colour blindness, and an epic stays traceable across a crowded year."
 *
 * The three states here are the three phase 2 can know. A placed span is `'solid'`; a feature or
 * item the forward pass left off the axis for `'no-estimate'` is `'hollow'` — nothing was sized, so
 * there is nothing to fill; one left off for `'in-cycle'` is `'contradicted'`, §5's dashed red
 * outline, which is the one case where the plan contradicts itself rather than merely omitting
 * something.
 *
 * §5 names those three treatments for *done*, *not started* and *carry-over*. **Phase 4 widened this
 * union rather than replacing it**, exactly as this paragraph asked: `'done'` is a fourth member, and
 * every reading of the first three is still true. Re-pointing `'solid'` at *done* would have turned
 * every placed bar in the product into a claim that work had finished.
 *
 * `'done'` is the only one of the four that is **not** a fact about the schedule: the other three come
 * out of `unscheduled`, and this one comes from a linked Microtask task's own count (design §7.2). So it
 * is not produced by {@link treatmentsOf} and cannot be — nothing in a schedule knows it — and a
 * renderer overlays it onto that map from the bridge's answer. {@link countsAsDone} is the threshold.
 *
 * **Carry-over is still not here, and that is deliberate rather than pending.** It needs a
 * schedule-versus-today reading as well as progress — a feature still open past the sprint it was
 * expected in — and spec §9's phase-4 row does not name it. Adding it would also be the first member of
 * this union that depended on *when it was drawn*, which is a different kind of thing from the four
 * above and wants its own decision.
 *
 * `ignoredEdges` is deliberately **not** a treatment. `@repo/contracts`' `IgnoredEdge` is explicit
 * that it is "Neither a cycle nor an unscheduled entry: the feature named here *did* get a span, one
 * of its stated dependencies was merely set aside to produce it. A canvas that could not tell 'this
 * bar ignores a dependency' from 'this bar could not be placed' would have to guess which sentence
 * to show." A feature named there is in `spans`, so it is `'solid'` here, and drawing it hollow or
 * dashed would show the wrong sentence — it was placed, and what is wrong with it is a dependency,
 * not its dates. It belongs to the conflict list, which is phase 3's.
 */
export type Treatment = 'solid' | 'hollow' | 'contradicted' | 'done'

/**
 * Whether a counted task says this mark's work is finished.
 *
 * The fourth member's own question, here rather than in a renderer so the threshold is stated once:
 * **`total` must be above zero**. A linked task with no checklist in it counts `{ done: 0, total: 0 }`,
 * and `0 === 0` would call that finished — the one arithmetic mistake this union's arrival makes
 * available, and the reason design §7.2 insists "a number on screen is always a counted number".
 *
 * It takes the pair rather than a whole row, so the caller's shape is its own business and this stays
 * usable from a package that knows nothing about the bridge's wire types.
 */
export const countsAsDone = (counted: { readonly done: number; readonly total: number }): boolean =>
  counted.total > 0 && counted.done >= counted.total

/**
 * The schedule widened with the one collection a treatment is read from.
 *
 * `CanvasSchedule`'s note asks a later module needing `unscheduled`, `cycles` or `ignoredEdges` to
 * widen it rather than restate the wire shape a second time; this is that module, and `unscheduled`
 * is all of it. `cycles` is not here because it would be a second route to the same answer — every
 * feature in a cycle already carries an `'in-cycle'` entry in `unscheduled`, so reading `cycles` too
 * would let two derivations of one mark's treatment disagree. `ignoredEdges` is not here for the
 * reason {@link Treatment} argues at length.
 *
 * `Unscheduled` is imported from `@repo/schedule` rather than restated, the way `CanvasSpan` extends
 * its `Span`: the `id`-and-`reason` pair is declared once, so a reason the forward pass adds cannot
 * be a reason this package has never heard of. A parsed `ScheduleView` is assignable here — its
 * `UnscheduledEntry` is the same pair, with `EntityId` narrowing the `id` to a ULID — and so is a
 * `ScheduleResult` with its `days` map projected to `spans`.
 */
export interface CanvasScheduleWithStatus extends CanvasSchedule {
  readonly unscheduled: readonly Unscheduled[]
}

const TREATMENTS: Readonly<Record<UnscheduledReason, Treatment>> = {
  'no-estimate': 'hollow',
  'in-cycle': 'contradicted',
}

/**
 * Every mark whose treatment is **not** `'solid'`, keyed by the id it belongs to, built once per
 * layout and shared — the treatment half of what `spansById` is for geometry.
 *
 * A missing id is `'solid'`, so the read is `treatments.get(id) ?? 'solid'`, and that absence is the
 * whole point rather than a gap to fill: a map holding a `'solid'` entry for all 2 000 placed items
 * would be 2 000 entries saying what the default already says, and building it would mean walking
 * `spans` — which nothing here does, for the reason {@link treatmentOf} argues.
 *
 * Build this **once per layout and thread it through**, exactly as `spansById` is threaded through
 * `railLayout` and `itemsToMarks`. A renderer drawing a whole canvas has an id per mark and needs a
 * treatment per mark; with this the total cost is one pass over `unscheduled` plus a hash lookup per
 * mark, where calling {@link treatmentOf} per mark is a scan of `unscheduled` per mark.
 *
 * Ids are assumed unique, as the forward pass assumes it. A repeated id keeps the last entry, and a
 * plan with duplicate ids is corrupt rather than a case to defend against here.
 */
export function treatmentsOf(
  schedule: CanvasScheduleWithStatus,
): ReadonlyMap<string, Treatment> {
  return new Map(schedule.unscheduled.map((entry) => [entry.id, TREATMENTS[entry.reason]]))
}

/**
 * How to draw the mark for one feature or item id.
 *
 * Takes an **id**, not a `FeatureBar` or an `ItemMark`, and that is what makes one function serve
 * both: `FeatureBar.id` and `ItemMark.id` are the same kind of string, so a renderer mapping over
 * either calls `treatmentOf(bar.id, schedule)` with what it already holds and needs no second
 * function, no discriminator and no branch. An id also lets the caller ask about a feature that got
 * **no** mark at all, which is the only way a `'hollow'` or `'contradicted'` answer is ever reached:
 * an unplaced feature is absent from `spans`, so it has no bar, and a list of unplaced features
 * drawn from the plan is where those two treatments get rendered.
 *
 * ### Why `spans` is never read
 *
 * A placed mark is `'solid'`, and this reaches that answer by finding the id **absent from
 * `unscheduled`** rather than present in `spans`. The forward pass puts every feature and item it
 * walked in exactly one of the two — `writeFeature` either records a span or pushes an unscheduled
 * entry for the feature and each of its items, never both — so the two collections are disjoint and
 * either one decides the question. Nothing here touches `spans`, so no caller pays a second pass
 * over it, and `spansById` stays the one lookup built per layout.
 *
 * ### One id at a time, and what that costs
 *
 * This scans `unscheduled` per call, which is right for a handful of ids and **wrong for a whole
 * canvas**. `unscheduled` is not a short list in general: it is bounded by features plus items, the
 * same 200 and 2 000 that bound `spans` (spec §4.3), and a plan with no estimates authored anywhere
 * puts every one of them there — so the worst case is a scan of 2 200 per mark, 2 200 times. It is
 * short only for a *healthy* plan, which is not a property to build a renderer on. A caller drawing
 * more than a few marks builds {@link treatmentsOf} once instead and reads it per mark. Note that a
 * fixture in which everything is placed leaves `unscheduled` empty and cannot show this at all, so
 * a render-at-the-cap test is not evidence either way.
 *
 * An id the schedule mentions nowhere answers `'solid'`, which keeps the function total. It is not a
 * claim about a drawing: an item whose `featureId` names no feature "appears in neither `days` nor
 * `unscheduled`" per the forward pass, so it has no mark to draw and nothing asks. The alternative,
 * a fourth state or a `null`, would put a branch in every renderer for a case no renderer can reach.
 *
 * Neither argument is mutated, and the answer depends on nothing but the two values passed in.
 */
export function treatmentOf(id: string, schedule: CanvasScheduleWithStatus): Treatment {
  const entry = schedule.unscheduled.find((candidate) => candidate.id === id)
  return entry === undefined ? 'solid' : TREATMENTS[entry.reason]
}
