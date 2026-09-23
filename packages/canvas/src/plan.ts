import type { PlanStructure, ScheduleEpic, Span } from '@repo/schedule'

/**
 * A rail's record as the canvas reads it: `@repo/schedule`'s `ScheduleEpic` plus the one field the
 * forward pass has no use for and the canvas cannot draw a rail without.
 *
 * `colour` is a plain `string` rather than a restated `#rrggbb` pattern. The API validated it and
 * enforced lowercase — one canonical spelling per colour, which is what lets a client compare rail
 * colours with `===` — so a second pattern here could only ever disagree with the one that already
 * failed the write. The canvas carries the value through untouched and never chooses a hue.
 */
export interface CanvasEpic extends ScheduleEpic {
  readonly colour: string
}

/**
 * The plan a layout is derived from: everything the forward pass reads, with epics carrying colour.
 *
 * Extends `PlanStructure` rather than restating it, and that is the load-bearing half: `railsOf`
 * takes a `PlanStructure`, so extending it is what keeps the same value passable to the function
 * that knows the order the spans were placed in. A local copy of the shape would let this package
 * re-derive a rail order of its own, and a rail order derived twice is a bar drawn on the wrong
 * rail. Only `epics` is narrowed, and `readonly CanvasEpic[]` is assignable to
 * `readonly ScheduleEpic[]`, so a `CanvasPlan` is a `PlanStructure` by construction.
 *
 * A contracts-shaped `PlanView` satisfies this structurally and needs no adapter: `PlanEpic`,
 * `PlanFeature` and `PlanItem` are each wider than their counterpart here, and nothing in this shape
 * is optional, so `exactOptionalPropertyTypes` cannot bite. Not every member is one the layout
 * reads — `pinSprint` and `dependsOn` are read by the forward pass and by nothing here — they are
 * present because `railsOf` takes a whole `PlanStructure`, which is the paragraph above.
 */
export interface CanvasPlan extends PlanStructure {
  readonly epics: readonly CanvasEpic[]
}

/**
 * One feature's or item's placement as the **wire** carries it: an id beside its working-day offsets.
 *
 * `@repo/schedule`'s in-memory `ScheduleResult` keys its spans by id in a `Map`, and a `Map` does
 * not survive `JSON.stringify` — so the wire form is an array and each entry has to say which
 * feature or item it belongs to. This is a structurally widened restatement of the wire shape rather
 * than an import of it, for the reason `packages/ui/src/transfer/vocabulary.ts` restates its own: the
 * declaration lives in `@repo/contracts`, which depends on Zod, and this package's purity test
 * asserts it declares no runtime dependency beyond `@repo/schedule`.
 *
 * The **pair of offsets** is not restated, though: it extends `@repo/schedule`'s `Span`, so the one
 * pair of numbers both packages have to agree about is declared once. `endDay` is exclusive there,
 * which is what makes a width `endDay - startDay` with no `+ 1` and gives a zero-day milestone
 * `startDay === endDay`. Only the `id` is added, for the reason above.
 */
export interface CanvasSpan extends Span {
  readonly id: string
}

/**
 * The schedule as the wire carries it, narrowed to the placed spans.
 *
 * Only `spans` is declared because only `spans` is read to lay out geometry. A later module that
 * needs `unscheduled`, `cycles` or `ignoredEdges` — a mark's treatment is a statement about those —
 * should widen this interface rather than restate the wire shape a second time. A parsed
 * `ScheduleView` is assignable here either way.
 */
export interface CanvasSchedule {
  readonly spans: readonly CanvasSpan[]
}

/**
 * Every placed span keyed by the id it belongs to, built once per layout and shared.
 *
 * This is the lookup the no-discriminator hazard calls for, turned inside out. `spans` carries
 * feature ids and item ids in **one array with nothing to tell them apart**; a client is expected to
 * tell them apart by looking an id up in the plan. Rather than classify every span, every geometry
 * module here walks the **plan** in derived order — `railsOf` for features, `itemsByFeature` for
 * items — and asks this map for the id it already holds. An id of the wrong kind is then never asked
 * for, so no separate id-to-kind map is needed on either side and no module can classify a span
 * differently from its sibling. Build this once and thread it through; do not rebuild it per rail.
 *
 * A missing id answers `undefined`, which is the whole point: a feature the pass could not place is
 * absent from `spans`, and absent is a different sentence from placed at day zero. Ids are assumed
 * unique, exactly as the forward pass assumes it — a repeated id keeps the last span, and a plan
 * with duplicate ids is corrupt rather than a case to defend against here.
 */
export function spansById(schedule: CanvasSchedule): ReadonlyMap<string, CanvasSpan> {
  return new Map(schedule.spans.map((span) => [span.id, span]))
}
