import {
  barLabels,
  dayToX,
  itemsToMarks,
  railLayout,
  scaleFor,
  countsAsDone,
  countsAsStarted,
  treatmentsOf,
  widthOfDays,
} from '@repo/canvas'
import type {
  BarLabel,
  DayRange,
  DependencyArc,
  ItemMark,
  PlanScale,
  RailBox,
  Rung,
  Treatment,
} from '@repo/canvas'
import { canvasArcs } from './arc-view'
import { LABEL_METRICS, LAYOUT, NODE_LABEL_METRICS } from './mark-metrics'
import { DRAWS } from './rung-view'
import type { RungDrawing } from './rung-view'
import type { PlanScreenModel } from '../plan-screen-model'

/**
 * The numbers every mark is placed from, re-exported so a component reaches one module for the
 * geometry and the metrics together rather than importing from two that are always used as one.
 */
export { BAR_GAP, LABEL_METRICS, LAYOUT, NODE_LABEL_METRICS, NODE_RADIUS } from './mark-metrics'

/**
 * The fallback window a canvas draws when a caller names none: one quarter of working days.
 *
 * Every real caller passes a range derived from the plan (`rangeFor`), so this is the default a test
 * or a stray render gets rather than the product's own window. It stays a whole quarter because that
 * is the rung `rungFor` calls `feature`, which is the rung with bars and item ticks on it.
 */
export const CANVAS_RANGE: DayRange = { fromDay: 0, toDay: 60 }

/**
 * The default scale, with **no gutter**.
 *
 * The gutter was the strip of SVG to the left of day zero that the rail names were drawn into. Names
 * are HTML now, in a column beside the canvas, so there is nothing to the left of day zero and
 * `dayToX(0)` is `0`. Keeping a gutter would leave an empty inset at the start of every axis and
 * push the first bar away from the header cell above it.
 */
export const CANVAS_SCALE: PlanScale = scaleFor({ pxPerDay: 14, gutter: 0 })

/**
 * Everything one rail band needs that is not its own geometry: what to draw, what to call it, how to
 * treat it, and where it opens.
 *
 * Built once per canvas by {@link canvasLayout} and handed down whole, so a rail looks nothing up and
 * every band is drawn from one pass over the plan rather than one per rail.
 */
export interface RailFrame {
  readonly marks: ReadonlyMap<string, readonly ItemMark[]>

  readonly treatments: ReadonlyMap<string, Treatment>

  readonly groups: ReadonlyMap<string, string>

  readonly draws: RungDrawing

  /** Where each bar's name goes, keyed by feature id. */
  readonly labels: ReadonlyMap<string, BarLabel>

  /** What each bar is called, keyed by feature id. */
  readonly names: ReadonlyMap<string, string>

  /**
   * Where a bar opens, or `null` for a canvas nobody can open anything from.
   *
   * A bar is a link as well as a drag handle. Clicking one is how a person opens the thing they are
   * looking at, and a chart whose marks do nothing when clicked is a picture of a plan rather than a
   * way into one. The drag still works: `DragRoot` cancels the click the browser synthesises after a
   * gesture that actually moved, so dropping a bar does not also navigate away from the plan.
   *
   * A function rather than a prebuilt map, because the two surfaces root their URLs differently and
   * neither of them is knowable from the geometry.
   */
  readonly hrefOf: (featureId: string) => string | null
}

/** Which group each feature is in, keyed by feature id; a feature in no group is absent. */
export const groupsOf = (plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map(
    plan.features.flatMap((each) => (each.labelId === null ? [] : [[each.id, each.labelId] as const])),
  )

/** The y of a rail band's top, counting from the canvas origin. Band zero is the first rail. */
export const railTop = (index: number): number => LAYOUT.chromeHeight + index * LAYOUT.railHeight

const WITHIN_RAIL: Readonly<Record<'bar' | 'mark', number>> = {
  bar: LAYOUT.barTop,
  mark: LAYOUT.markTop,
}

/**
 * The y of one part inside a rail band, measured from that band's own top.
 *
 * A band is a stack of fixed offsets, so a second rail is the first one shifted by
 * {@link LAYOUT}.railHeight and nothing about a part's place inside it is recomputed per rail.
 */
export const insideRail = (top: number, part: 'bar' | 'mark'): number => top + WITHIN_RAIL[part]

/**
 * How tall the canvas is for a given number of rails.
 *
 * Floored at one rail, so a plan with nothing on it draws a band rather than an SVG of zero height,
 * which would clip every pixel of its own chrome.
 */
export const canvasHeight = (rails: number): number => railTop(Math.max(rails, 1))

/** How wide the canvas is for a range at a scale. The gutter is zero, and is added for the arithmetic to stay honest if one ever returns. */
export const canvasWidth = (scale: PlanScale, range: DayRange): number =>
  widthOfDays(range.toDay - range.fromDay, scale) + scale.gutter

/**
 * How many working days of grid are drawn past the end of the range, so the chrome reaches the
 * right edge of a pane nobody measured.
 *
 * ### Why there is a bleed at all
 *
 * The canvas is as wide as its range, and its range is floored at `PANE_WIDTH` — a constant, because
 * a Server Component cannot measure the pane it will be laid out in. On a wider screen the axis
 * therefore ended short of the pane's edge and left bare background beside it, which read as a
 * broken chart rather than as a short plan.
 *
 * The canvas now fills its pane with CSS (`w-full` over a `minWidth`), and with no `viewBox` that
 * costs no scaling at all — but filling a pane with nothing drawn in it only moves the bare strip
 * inside the element. So the bands and the ticks are generated past the range and the SVG viewport
 * clips whatever it does not reach. The marks are **not** bled: a bar past the range is a bar the
 * plan does not have.
 *
 * ### Why 120 and why a count of days
 *
 * It is a quarter of overrun at the Item stop's 42px a day — five thousand pixels — and half a year
 * at the Epic stop's 4px, so it covers any pane a browser can present at every zoom. A count of days
 * rather than of pixels because that is the unit both `calendarBands` and `sprintTicks` take, and
 * converting one to the other here would need the scale and answer a fractional day.
 *
 * It costs a dozen extra `<line>`s and a handful of `<rect>`s, all of them clipped.
 */
export const BLEED_DAYS = 120

/**
 * The range the **chrome** is drawn for: the range the marks use, bled to the right.
 *
 * Only to the right. Day zero is the plan's own first working day and there is no axis before it,
 * so a bleed leftwards would draw grid for days the plan does not have and push the first bar away
 * from the header cell above it.
 */
export const chromeRange = (range: DayRange): DayRange => ({
  fromDay: range.fromDay,
  toDay: range.toDay + BLEED_DAYS,
})

/** What each feature is called, keyed by id, for the labels drawn on its bar. */
export const featureNames = (plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map(plan.features.map((feature) => [feature.id, feature.name]))

/**
 * What each rail is called, keyed by epic id.
 *
 * A `RailBox` carries its `epicId` and not its name, because the geometry has no use for one. The
 * table imports this rather than writing its own join, so the two cannot disagree about what to call
 * a rail no epic claims.
 */
export const railNames = (plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map(plan.epics.map((epic) => [epic.id, epic.name]))

/** Where every bar's name goes, across every rail, keyed by feature id. */
/**
 * Where every mark's name goes, across every rail, keyed by feature id.
 *
 * ### A point is measured as a zero-width mark
 *
 * At the node rungs each bar is handed to `barLabels` with its width flattened to zero. That is not
 * a trick: a point *is* a zero-width mark — it is drawn at the day the feature starts and says
 * nothing about how long it runs — so measuring it as one gives exactly the right answer. Every
 * label lands outside, and each is bounded by the x of the next feature on its rail, which is the
 * gap that has to hold the text.
 *
 * The bars' own widths are left alone at the Sprint rung, where a name goes inside a bar wide enough
 * to hold it.
 */
export const labelsOf = (rails: readonly RailBox[], nodes: boolean): ReadonlyMap<string, BarLabel> =>
  new Map(
    rails.flatMap((rail) =>
      barLabels(
        nodes ? rail.bars.map((bar) => ({ ...bar, width: 0 })) : rail.bars,
        nodes ? NODE_LABEL_METRICS : LABEL_METRICS,
      ).map((label) => [label.id, label] as const),
    ),
  )

/** The item ticks of each feature, keyed by feature id, so a rail reads its own without a scan. */
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

/**
 * The progress rows the bridge answers with: how many of an item's tasks are done, out of how many.
 *
 * Structural rather than imported from `@repo/api-client`, so this module's shape is the shape it
 * reads and a caller can hand it a narrower record than the wire type.
 */
export type Counted = readonly {
  readonly itemId: string
  readonly progress: { readonly done: number; readonly total: number }
}[]

/** What a count of done-out-of-total makes an item look like, or `null` for nothing started. */
export const countedTreatment = (counted: {
  readonly done: number
  readonly total: number
}): Treatment | null => (countsAsDone(counted) ? 'done' : countsAsStarted(counted) ? 'started' : null)

/**
 * The schedule's own treatments, widened by what the bridge knows about each item's tasks.
 *
 * The schedule wins where both speak: a feature the pass could not place is drawn as unplaced
 * whatever its tasks say, because its position on the axis is the thing being explained.
 */
export function withProgress(
  treatments: ReadonlyMap<string, Treatment>,
  progress: Counted,
): ReadonlyMap<string, Treatment> {
  const widened = new Map(treatments)
  for (const row of progress) {
    if (widened.has(row.itemId)) continue
    const counted = countedTreatment(row.progress)
    if (counted !== null) widened.set(row.itemId, counted)
  }
  return widened
}

/**
 * Everything {@link canvasLayout} reads. One object, because the rung joined the list and five
 * positional parameters is one more than this repo allows.
 */
export interface CanvasQuery {
  readonly plan: PlanScreenModel
  readonly range: DayRange
  readonly scale: PlanScale

  /**
   * Which rung is drawn — bars, or one node per feature.
   *
   * Passed rather than read back off the range with `rungFor`. The range follows the plan's own span
   * now, so a short plan viewed at Year zoom produces a range `rungFor` calls `item`, and the canvas
   * would draw bars where the reader asked for a rollup.
   */
  readonly rung: Rung

  readonly progress: Counted

  /** Where a bar opens. See {@link RailFrame.hrefOf}. */
  readonly hrefOf: (featureId: string) => string | null
}

/** Everything a canvas draws, computed once from one pass over the plan. */
export interface CanvasLayout {
  readonly rails: readonly RailBox[]

  readonly height: number

  readonly width: number

  readonly arcs: readonly DependencyArc[]

  readonly frame: RailFrame
}

/**
 * One pass over the plan, answering everything the SVG needs.
 *
 * ### Why it is one call
 *
 * `railLayout`, `itemsToMarks`, `treatmentsOf` and `arcLayout` each walk the plan, and every one of
 * them has to agree with the others about which feature is on which rail and where. Calling them
 * together here from one set of arguments is what makes that agreement structural rather than a thing
 * to keep true by hand in four components.
 */
export function canvasLayout(query: CanvasQuery): CanvasLayout {
  const { plan, range, scale, rung, progress } = query
  const rails = railLayout(plan, plan.schedule, scale)
  return {
    rails,
    arcs: canvasArcs(plan, rails, LAYOUT),
    height: canvasHeight(rails.length),
    width: canvasWidth(scale, range),
    frame: {
      marks: marksByFeature(itemsToMarks(plan, plan.schedule, scale)),
      treatments: withProgress(treatmentsOf(plan.schedule), progress),
      groups: groupsOf(plan),
      draws: DRAWS[rung],
      labels: labelsOf(rails, DRAWS[rung].nodes),
      names: featureNames(plan),
      hrefOf: query.hrefOf,
    },
  }
}

/** The x of the first day on screen, which is where the axis begins and the drag stops refusing. */
export const axisX = (scale: PlanScale, range: DayRange): number => dayToX(range.fromDay, scale)
