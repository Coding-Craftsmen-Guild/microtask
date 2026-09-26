import {
  dayToX,
  itemsToMarks,
  railLayout,
  rungFor,
  scaleFor,
  countsAsDone,
  treatmentsOf,
  widthOfDays,
} from '@repo/canvas'
import type {
  DayRange,
  ItemMark,
  PlanScale,
  RailBox,
  RailMetrics,
  Rung,
  Treatment,
} from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'

/**
 * The stretch of working days the canvas draws, and the one number on this screen that nothing
 * measured.
 *
 * **It is a constant, not a measurement, and it could not be one.** The canvas is a Server
 * Component, so no viewport exists when it renders; and `happy-dom` answers every
 * `getBoundingClientRect` with a zero `DOMRect`, so a client component that measured one could not
 * be tested either. A range that came from a measurement would therefore be a number no test could
 * pin and no server could read. Phase 3's zoom and pan will pass a range in as a prop —
 * {@link PlanCanvasProps} already accepts one — and this is what the admin page chooses until they
 * do.
 *
 * Sixty working days is **one quarter, and deliberately the widest view still on the feature rung**.
 * `rungFor` in `@repo/canvas` answers `'feature'` for a range of 21 to 60 days and `'epic'` for
 * anything wider, and an epic-rung canvas draws rails with no bars on them at all — so a range
 * picked to show a whole plan, which is almost always wider than a quarter, would render a timeline
 * with nothing on it. `canvas/plan-canvas.test.tsx` asserts the rung this constant is at, so that
 * cannot happen silently.
 */
export const CANVAS_RANGE: DayRange = { fromDay: 0, toDay: 60 }

/**
 * Fourteen px per working day, with a 160px gutter for the rail labels.
 *
 * `pxPerDay` is a whole number because `PlanScale` asks for one: `xToDay` divides by it, and a
 * fraction that is inexact in binary makes a hover name the day before the one it is over. At 14 a
 * quarter is 840px of axis, so {@link CANVAS_RANGE} plus the gutter is a 1,000px canvas — wider than
 * the admin column on a laptop, which is why the screen wraps it in its own scroll container.
 *
 * The gutter is what a rail's name is drawn in. `PlanScale` documents it as the inset "before day
 * 0 … without it a rail label drawn at day 0's x would sit on the axis's own left edge with nothing
 * to its left to hold it", and 160px is what an epic name needs at this type size.
 */
export const CANVAS_SCALE: PlanScale = scaleFor({ pxPerDay: 14, gutter: 160 })

/**
 * Every fixed px measurement the canvas lays itself out with, in user units of the `viewBox`.
 *
 * One record rather than eight exported constants, because these are one decision — how tall a rail
 * band is and where the three things inside it sit — and a caller that could take `barTop` without
 * `railHeight` would be free to draw a bar outside its own rail.
 *
 * - `chromeHeight` is the band above the rails, holding the quarter labels and the sprint ticks.
 * - `railHeight` is one rail's own band: its name, its bars and the item marks under them.
 * - `barHeight` and `barTop` are a feature bar's height and its top **within its rail**.
 * - `markHeight` and `markTop` are an item mark's, a thin strip just under the bar it belongs to, so
 *   a feature and its items read as one thing rather than two rows.
 * - `labelBaseline` is how far a `<text>` baseline sits below the top of whatever band it labels.
 * - `labelInset` is the inset a `<text>` is drawn at, so a label never touches the edge it is
 *   clamped to.
 * - `stubWidth` and `stubGap` size and space the off-axis stubs {@link stubX} lays out.
 *
 * `stubWidth` and `stubGap` are here rather than local to the component that draws a stub, because
 * they are **shared geometry**: {@link stubX} needs both to know where the next stub starts, so a
 * value changed in one place and not the other is a row of overlapping rects. A purely cosmetic
 * number that nothing else reads — a corner radius — stays local to its own component.
 *
 * It `satisfies RailMetrics`, and that clause is load-bearing rather than decoration. `railAtY` and
 * `dropTargetFor` in `@repo/canvas` are handed **this record**: that package holds no viewport and no
 * type size, so it takes the two numbers a rail band is made of rather than declaring them, and its own
 * `RailMetrics` asks for "the record that is rendered from, rather than a fresh literal at the call
 * site", a second literal being "a band this reads and a band the SVG drew, free to disagree". Passing
 * an identifier runs no excess-property check, so until this clause the subset relation held by
 * hand-maintained luck — `chromeHeight` renamed in either package compiled here and broke at the drop.
 * With it, either rename is a compile error in this file. `as const` still comes first, so every field
 * keeps its literal type and nothing widens to `number`.
 *
 * The clause is `RailMetrics & Record<string, number>` and **not** `RailMetrics` alone, which does not
 * compile: `satisfies` runs an excess-property check against an object **literal**, so this record's other
 * eight fields — `barHeight`, `markTop`, `stubGap` and the rest — are each rejected as unknown to that
 * interface. The intersection says the two things that are true and wanted: the record carries whatever
 * `RailMetrics` names, spelled the way that package spells it, and is otherwise a record of numbers. What
 * it does not check, and cannot, is that the other eight are *only* numbers of this file's own choosing —
 * a field added to `RailMetrics` that this record already has under the same name and a different meaning
 * would pass, which is a hazard the annotation shares with the assignment it replaced.
 */
export const LAYOUT = {
  chromeHeight: 46,
  railHeight: 58,
  barHeight: 18,
  barTop: 16,
  markHeight: 5,
  markTop: 38,
  labelBaseline: 12,
  labelInset: 6,
  stubWidth: 22,
  stubGap: 5,
} as const satisfies RailMetrics & Record<string, number>

/**
 * What each of §5's three rungs draws, as of phase 2.
 *
 * §5's own three rows are epic rails with feature nodes, dependency arcs and milestone diamonds;
 * feature bars sized by estimate with items inside where they fit; and item bars with labels and the
 * linked Microtask task. Phase 2 draws the middle row. **The epic rung therefore draws its rails and
 * their names and nothing else** — nodes, arcs and diamonds are not built yet, and a rail with no
 * mark on it is the honest rendering of that rather than a bar drawn at a rung §5 does not put bars
 * at. The item rung draws what the feature rung draws; its labels and its linked task are phase 4's,
 * since no progress and no `linkedTaskId` behaviour exists on the wire yet.
 *
 * A record rather than two `rung !== 'epic'` tests at the two call sites, so the table above is one
 * value a reader can check against §5 and a widening cannot land in one branch and miss the other.
 */
export const DRAWS: Readonly<Record<Rung, RungDrawing>> = {
  epic: { bars: false, items: false },
  feature: { bars: true, items: true },
  item: { bars: true, items: true },
}

/** Which marks one rung puts on a rail. */
export interface RungDrawing {
  /** Whether feature bars are drawn. */
  readonly bars: boolean

  /** Whether item marks are drawn under them. */
  readonly items: boolean
}

/**
 * Everything every rail on one canvas shares, built once and threaded through.
 *
 * One object rather than five props on every rail, and built once rather than per rail, which is the
 * rule `treatmentsOf` states for itself: "Build this **once per layout and thread it through**,
 * exactly as `spansById` is threaded through `railLayout` and `itemsToMarks`" — calling `treatmentOf`
 * per mark is a scan of `unscheduled` per mark, and at the 2,000-item cap that is a scan of 2,200
 * done 2,200 times.
 */
export interface RailFrame {
  /** Every placed item's mark, grouped by the feature it flows under. */
  readonly marks: ReadonlyMap<string, readonly ItemMark[]>

  /** Every **non-solid** treatment, by the id it belongs to. A missing id is `'solid'`. */
  readonly treatments: ReadonlyMap<string, Treatment>

  /**
   * Which group each feature is in, by feature id. A feature in no group is simply absent.
   *
   * A map of the ids that **have** one, for the reason `treatments` above holds only the non-solid
   * marks: most features are in no group, and an entry saying so for every one of 200 would state what
   * the absence already states.
   *
   * Nothing on this canvas paints from it. It reaches the SVG as `data-label-id` on each bar and on each
   * item mark under it, and what reads that back is the one CSS rule `labels/group-css.ts` generates per group —
   * so selecting a group dims every bar that is not in it, on every rail at once, with no JavaScript and
   * no second render. An item takes its **feature** ss group, since an item has none of its own: design
   * §7 gives a group to the work a release is planned in, and an item is part of a feature rather than a
   * thing a release contains directly.
   */
  readonly groups: ReadonlyMap<string, string>
  /** What this canvas's rung draws. */
  readonly draws: RungDrawing

  /** Where a rail's own name is drawn, inside the label gutter. */
  readonly labelX: number

  /** The x of day `range.fromDay`: the axis's left edge, and the gutter's right. */
  readonly axisX: number
}

/**
 * Which group each feature is in, by feature id, holding only the features that are in one.
 *
 * Built from the plan rather than threaded in as a prop, because a feature's `labelId` is already on the
 * plan every surface here is handed — and a second source for it would be a second thing to keep in step
 * with a regroup.
 */
export const groupsOf = (plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map(
    plan.features.flatMap((each) => (each.labelId === null ? [] : [[each.id, each.labelId] as const])),
  )

/** The y of one rail's own band, from its index in the order `railLayout` returned. */
export const railTop = (index: number): number => LAYOUT.chromeHeight + index * LAYOUT.railHeight

const WITHIN_RAIL: Readonly<Record<'label' | 'bar' | 'mark', number>> = {
  label: LAYOUT.labelBaseline,
  bar: LAYOUT.barTop,
  mark: LAYOUT.markTop,
}

/**
 * The y of one part of a rail's band, from the band's own top.
 *
 * The three offsets are one decision — where a name, a bar and an item strip sit inside a 58px band —
 * and four components were each adding their own `top + LAYOUT.<field>`. A record keyed on a closed
 * three-case union puts the decision in this file, where the rest of the geometry is, and makes a
 * fourth part a compile error rather than a fifth call site to find.
 */
export const insideRail = (top: number, part: 'label' | 'bar' | 'mark'): number =>
  top + WITHIN_RAIL[part]

/**
 * The x of the nth off-axis stub, laid out leftward from the axis's own left edge.
 *
 * Here and not in the component that draws one, for the reason every other number on this canvas is
 * here: it is stacking arithmetic, and arithmetic in a render function is arithmetic `happy-dom`
 * cannot check — `getBBox` and `getBoundingClientRect` both answer a zero `DOMRect`, so a stub drawn
 * on top of its neighbour looks identical to one beside it from a test's side. As a function it is
 * asserted directly, next to {@link railTop}, {@link gutterX} and {@link labelX}, which exist for the
 * same reason.
 *
 * Leftward, so `index` 0 is nearest the axis and the overflow of a rail with more unplaced features
 * than the gutter holds falls off the `viewBox`'s left edge rather than across the timeline.
 * `UnplacedFeatures` argues why that is the right way for it to fail.
 */
export const stubX = (frame: RailFrame, index: number): number =>
  frame.axisX - LAYOUT.labelInset - (index + 1) * (LAYOUT.stubWidth + LAYOUT.stubGap)

/** The height of a canvas holding `rails` rails, never shorter than one rail's band. */
export const canvasHeight = (rails: number): number => railTop(Math.max(rails, 1))

/** The width of a canvas showing one range at one scale, the label gutter included. */
export const canvasWidth = (scale: PlanScale, range: DayRange): number =>
  widthOfDays(range.toDay - range.fromDay, scale) + scale.gutter

/**
 * The x of the label gutter's own left edge, which is also the `viewBox`'s.
 *
 * `dayToX` puts day 0 one gutter in from x 0, so the gutter of a viewport starting at day 0 runs
 * from 0 to 160 and the axis starts after it. A viewport scrolled to day 40 has its gutter at
 * `dayToX(40) - 160`, which is why this is arithmetic on the scale rather than the constant 0.
 */
export const gutterX = (scale: PlanScale, range: DayRange): number =>
  dayToX(range.fromDay, scale) - scale.gutter

/**
 * The `viewBox` for one range at one scale: the gutter, the days, and every rail.
 *
 * The `viewBox` is what clips the canvas, which is why nothing in `@repo/canvas` clips geometry to
 * the range — a partly visible quarter band comes back whole, and this crops it. What it does
 * **not** clip is a `<text>`: see {@link labelX}.
 */
export const viewBoxOf = (rails: number, scale: PlanScale, range: DayRange): string =>
  `${String(gutterX(scale, range))} 0 ${String(canvasWidth(scale, range))} ${String(canvasHeight(rails))}`

/**
 * A chrome label's x, clamped into the viewport.
 *
 * `quarterBands` says this in its own words: "A partly-visible band has an `x` left of the viewport,
 * so a `<text>` anchored at `band.x` renders off-screen and the visible half of the band reads as
 * unlabelled. A renderer must clamp the label's x into the viewport … rather than clamp the band's."
 * The band keeps its true x and its true width, because a band clipped in the geometry would report
 * a width that is not a quarter's; only the label moves.
 *
 * **No test can catch a missing clamp**, because catching it means measuring where a glyph landed
 * and `happy-dom` answers every measurement with a zero `DOMRect`. What the test beside this can
 * assert is that the clamp was applied — that the label's `x` is not the band's when the band starts
 * left of the viewport — and it does.
 */
export const labelX = (x: number, scale: PlanScale, range: DayRange): number =>
  Math.max(x, dayToX(range.fromDay, scale)) + LAYOUT.labelInset

/**
 * Each epic's name by its id, because a `RailBox` carries an `epicId` and a colour and no name.
 *
 * `railLayout` identifies a rail by the `epicId` its first feature declares, and the plan is where
 * the name for that id lives — so a rail label is a join back to `plan.epics` and never something
 * the layout could have handed over. A rail whose `epicId` names no epic gets no entry here, which
 * is the same absence its `colour: null` states.
 */
export const railNames = (plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map(plan.epics.map((epic) => [epic.id, epic.name]))

/**
 * Each rail's features the forward pass left off the axis, keyed on the epic id the rail is keyed on.
 *
 * Read off the boxes `railLayout` already answered, and off neither the plan nor `railsOf`. A
 * `RailBox` carries `featureIds` — every feature on the rail in the one order the layout derived, the
 * ones its bars omit included — so a rail's unplaced features are a filter over that array. This took
 * the plan and called `railsOf` a second time until `featureIds` landed, and `railLayout` names what
 * that risks: "a second total order written in this package could disagree with the first on any tie —
 * which is a bar drawn on the wrong rail, silently, at exactly the zoom level nobody tested."
 * `featureIds` is carried out of the layout for exactly this, in its own words: the paragraph on a rail
 * order derived twice "applies to a consumer re-deriving it just as much as to this module". One call,
 * one array, and a stub sits on the rail its bars are on because it came out of the same box they did.
 *
 * "Unplaced" is read as **present in `treatments`**, not as absent from `spans`. The forward pass puts
 * every feature it walked in exactly one of the two collections, so either decides the question, and
 * the map is already built once for the marks — where checking `spans` would mean a second lookup
 * structure over the same answer.
 */
export const unplacedByRail = (
  rails: readonly RailBox[],
  treatments: ReadonlyMap<string, Treatment>,
): ReadonlyMap<string, readonly string[]> =>
  new Map(
    rails.map((rail) => [rail.epicId, rail.featureIds.filter((id) => treatments.has(id))] as const),
  )

/**
 * Item marks grouped by the feature they flow under, built once per canvas.
 *
 * `itemsToMarks` answers a flat array carrying `featureId` on each mark, and argues why: grouping in
 * the package "would have to invent a group for exactly the case above — an id that names no real
 * feature". A renderer does need the grouping, because it draws a bar and then the items inside it,
 * and at the 2,000-item cap doing that by filtering the flat array once per feature is 200 scans of
 * 2,000. This is one pass, and the absent group is simply a bar with no items under it.
 */
export const marksByFeature = (
  marks: readonly ItemMark[],
): ReadonlyMap<string, readonly ItemMark[]> => {
  const byFeature = new Map<string, ItemMark[]>()
  for (const mark of marks) {
    const group = byFeature.get(mark.featureId)
    if (group === undefined) byFeature.set(mark.featureId, [mark])
    else group.push(mark)
  }
  return byFeature
}

/** What the bridge counted, keyed by item: the shape `PlanBridge['items']` already has. */
export type Counted = readonly { readonly itemId: string; readonly progress: { readonly done: number; readonly total: number } }[]

/**
 * The schedule's treatments with `'done'` overlaid for every item a linked task reports finished.
 *
 * An overlay rather than a fourth case inside `treatmentsOf`, because the two answers come from
 * different places: the first three are facts about the forward pass, and this one is a fact about
 * another product (design §7.2). `@repo/canvas` cannot produce it — nothing in a schedule knows what a
 * Microtask task counts — so the map is widened here, where both halves are in hand.
 *
 * **A mark the schedule already has an opinion about keeps it.** An item that is hollow was never sized
 * and an item that is contradicted sits in a cycle; either is a more urgent sentence than "its task is
 * finished", and a plan that contradicts itself must not be able to hide that behind a tick. Only a mark
 * the schedule placed — absent from the map, so read as `'solid'` — can become `'done'`.
 */
export function withDone(
  treatments: ReadonlyMap<string, Treatment>,
  progress: Counted,
): ReadonlyMap<string, Treatment> {
  const widened = new Map(treatments)
  for (const row of progress) {
    if (!widened.has(row.itemId) && countsAsDone(row.progress)) widened.set(row.itemId, 'done')
  }
  return widened
}

/** One canvas's own `<svg>` box, its rails, and everything those rails need to draw themselves. */
export interface CanvasLayout {
  /** Every rail, in the one order `railLayout` derived. One `<g>` each, top to bottom. */
  readonly rails: readonly RailBox[]

  /** The `<svg>`'s `height`, which is also the height the chrome layers are drawn to. */
  readonly height: number

  /** The `<svg>`'s `width`, the label gutter included. */
  readonly width: number

  /** The `<svg>`'s `viewBox`, which is what crops the geometry to the range. */
  readonly viewBox: string

  /** Each epic's name by its id, for the rail label a `RailBox` carries no name for. */
  readonly names: ReadonlyMap<string, string>

  /** Each rail's off-axis features, keyed on the epic id the rail is keyed on. */
  readonly unplaced: ReadonlyMap<string, readonly string[]>

  /** What every rail on this canvas shares, built once. */
  readonly frame: RailFrame
}

/**
 * Everything one render of the canvas needs, derived in one place from the plan, the range and the
 * scale.
 *
 * Here rather than in `PlanCanvas` for the reason the rest of this file is here: it is the deciding of
 * which pure function to call in what order, and it is asserted directly instead of through a rendered
 * `<svg>` that `happy-dom` cannot measure. What is left in the component is which of these to nest
 * inside which, and nothing that computes a number.
 *
 * `treatmentsOf` is called **once** and threaded into both the {@link RailFrame} and
 * {@link unplacedByRail}, which is the rule that function states for itself and the reason the two
 * cannot disagree about which features the forward pass left off the axis. `railLayout` is likewise
 * called once, and {@link railNames} and {@link unplacedByRail} read the boxes it answered rather than
 * re-deriving a rail order the layout already decided.
 *
 * It takes the range and the scale as arguments rather than reading {@link CANVAS_RANGE} and
 * {@link CANVAS_SCALE}, so that every rung stays reachable: `rungFor` reads the range, and a caller
 * passing a range wider than a quarter gets the epic rung's `draws` out of this and a canvas with no
 * bars on it — which is what `plan-canvas.test.tsx` renders to pin the rung.
 */
export function canvasLayout(
  plan: PlanScreenModel,
  range: DayRange,
  scale: PlanScale,
  progress: Counted = [],
): CanvasLayout {
  const rails = railLayout(plan, plan.schedule, scale)
  const treatments = withDone(treatmentsOf(plan.schedule), progress)
  return {
    rails,
    height: canvasHeight(rails.length),
    width: canvasWidth(scale, range),
    viewBox: viewBoxOf(rails.length, scale, range),
    names: railNames(plan),
    unplaced: unplacedByRail(rails, treatments),
    frame: {
      marks: marksByFeature(itemsToMarks(plan, plan.schedule, scale)),
      treatments,
      groups: groupsOf(plan),
      draws: DRAWS[rungFor(range)],
      labelX: gutterX(scale, range) + LAYOUT.labelInset,
      axisX: dayToX(range.fromDay, scale),
    },
  }
}
