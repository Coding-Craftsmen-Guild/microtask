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
 * §5 names those three treatments for *done*, *not started* and *carry-over*, and **that is not what
 * they mean here**: done and carry-over both need progress, which arrives with the Microtask bridge
 * in phase 4 and does not exist on the wire yet. Phase 2's three schedule states map onto the same
 * three drawings without inventing data, so the channel §5 reserved is in use and nothing has to be
 * faked. Phase 4 widens this union rather than replacing it — a member added leaves every reading
 * here true, whereas re-pointing `'solid'` at *done* would silently turn every placed bar in the
 * product into a claim that work had finished.
 *
 * `ignoredEdges` is deliberately **not** a treatment. `@repo/contracts`' `IgnoredEdge` is explicit
 * that it is "Neither a cycle nor an unscheduled entry: the feature named here *did* get a span, one
 * of its stated dependencies was merely set aside to produce it. A canvas that could not tell 'this
 * bar ignores a dependency' from 'this bar could not be placed' would have to guess which sentence
 * to show." A feature named there is in `spans`, so it is `'solid'` here, and drawing it hollow or
 * dashed would show the wrong sentence — it was placed, and what is wrong with it is a dependency,
 * not its dates. It belongs to the conflict list, which is phase 3's.
 */
export type Treatment = 'solid' | 'hollow' | 'contradicted'

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
 * either one decides the question. Reading the short list is the whole point: `spans` holds up to
 * 200 features and 2 000 items (spec §4.3), `unscheduled` holds only what failed, and a treatment
 * asked for once per mark must not walk the long array once per mark. Nothing here touches `spans`,
 * so no caller pays a second pass over it, and `spansById` stays the one lookup built per layout.
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
