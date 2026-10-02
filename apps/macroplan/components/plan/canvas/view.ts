import {
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
  DayRange,
  ItemMark,
  PlanScale,
  RailBox,
  Rung,
  Treatment,
} from '@repo/canvas'
import { canvasArcs } from './arc-view'
import type { CanvasArc } from './arc-view'
import { ARC_METRICS, LAYOUT } from './mark-metrics'
import { DRAWS } from './rung-view'
import { detailsOf } from './detail-lines'
import type { RungDrawing } from './rung-view'
import type { PlanScreenModel } from '../plan-screen-model'
import { searchOf } from '../table/row-keys'

/**
 * The numbers every mark is placed from, re-exported so a component reaches one module for the
 * geometry and the metrics together rather than importing from two that are always used as one.
 */
export { BAR_GAP, ITEM_GAP, LAYOUT, NODE_RADIUS } from './mark-metrics'

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

  /** What each group is coloured, keyed by label id, for {@link hueOf} to prefer over a rail's. */
  readonly hues: ReadonlyMap<string, string>

  readonly draws: RungDrawing

  /**
   * What a hover over one mark says, joined, keyed by **feature or item** id.
   *
   * The only entry in this record that is not geometry, and it is here for the reason every other one
   * is: a mark is drawn from the frame and nothing else, so a bar carries its card without the
   * component that draws it looking anything up. 'detail-lines.ts' carries what is in a card and why
   * the wording is the table's rather than a third opinion about it.
   */
  readonly details: ReadonlyMap<string, string>

  /**
   * What each feature can be found by, lowered, keyed by feature id.
   *
   * On the frame for the reason `details` is: a mark is drawn from the frame and nothing else, so a
   * feature's `<g>` carries the name the board's filter matches on without the component drawing it
   * looking anything up. {@link featureSearch} carries why it is lowered on the server.
   */
  readonly search: ReadonlyMap<string, string>

  /**
   * What each feature and item is **called**, keyed by id — the name a mark writes on itself.
   *
   * Beside `search` rather than derived from it, because they are two different strings for two
   * different readers: one is lowered so a filter can match it without lowering two hundred names on
   * every keystroke, and this is the plan's own casing, which is what a reader sees.
   */
  readonly names: ReadonlyMap<string, string>

  /**
   * What each rail is called, which only a drawn chip needs.
   *
   * A draw that crosses lanes says "New feature on Payments", and the lane it crossed to is a rail the
   * mark it came from knows nothing about. The names ride in the frame rather than being read off the
   * epics by a mark, for the reason every other map here does: the canvas is handed one frame.
   */
  readonly rails: ReadonlyMap<string, string>

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

/** What each group is coloured, keyed by label id. */
export const labelHues = (plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map(plan.labels.map((label) => [label.id, label.colour]))

/**
 * What each feature can be found by, keyed by feature id and lowered once on the server.
 *
 * It lands on the mark as `data-search` and the board's filter matches on it
 * (`../board/board-filter.tsx`), which is why it is lowered here rather than at the keystroke: a
 * plan of two hundred features would otherwise lower two hundred names on every letter typed.
 *
 * Its **rail** and its group are in the key as well as its own name, built by the very function a table
 * row's key is built by, so the two searches cannot come to mean different things. A filter that matched a feature's own name alone
 * dimmed every bar on a rail whose name had just been typed — the rail's row stayed lit in the column
 * beside a lane of faded work, which reads as "nothing here matches" about the one rail that did.
 */
export const featureSearch = (plan: PlanScreenModel): ReadonlyMap<string, string> => {
  const rails = railNames(plan)
  const groups = new Map(plan.labels.map((label) => [label.id, label.name]))
  const key = (one: { epicId: string; labelId: string | null; name: string }): string =>
    searchOf([one.name, rails.get(one.epicId) ?? null, groups.get(one.labelId ?? '') ?? null])
  return new Map(plan.features.map((feature) => [feature.id, key(feature)]))
}

/**
 * What everything on the canvas is called, keyed by id, features and items in one map.
 *
 * One map for both because the ids cannot collide — every id in a plan is minted from one space —
 * and because a mark looking up its own name should not first have to know which kind it is. It is
 * the same join `detailsOf` makes for the hover card, kept separate from it because a card's lines
 * are sentences and this is one word.
 */
export const namesOf = (plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map([
    ...plan.features.map((feature) => [feature.id, feature.name] as const),
    ...plan.items.map((item) => [item.id, item.name] as const),
  ])

/**
 * The hue one feature's marks are drawn in: its **group's** colour, or its **rail's** where it is in
 * no group.
 *
 * ### Why a group outranks a rail
 *
 * ADR 0064 fixed a group's colour as "a swatch and never a fill", on design §5's rule that an epic
 * owns hue and hue cannot carry two meanings. The product owner has reassigned the channel, and this
 * one line is the whole of the new rule — so hue stays single-valued, and what it names is the thing
 * a reader most often came to find.
 *
 * A group cuts **across** rails by construction, which is why it is worth the channel: a rail is a
 * lane the eye can already follow by position, and a phase spread over four of them is a set nothing
 * else on the canvas can pick out. What it costs is stated rather than hidden — on a plan where every
 * feature is grouped, the canvas stops showing rail membership in hue at all, and the band and the
 * names column carry it instead.
 *
 * @param frame - The canvas's own frame, holding both the per-feature group and the per-group colour.
 * @param featureId - The feature whose mark is being drawn.
 * @param rail - Its rail's colour, or `null` for a rail no epic claims.
 * @returns The colour to paint with, or `null` when neither a group nor a rail offers one.
 */
export const hueOf = (frame: RailFrame, featureId: string, rail: string | null): string | null =>
  frame.hues.get(frame.groups.get(featureId) ?? '') ?? rail

/** Which group each feature is in, keyed by feature id; a feature in no group is absent. */
export const groupsOf = (plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map(
    plan.features.flatMap((each) => (each.labelId === null ? [] : [[each.id, each.labelId] as const])),
  )

/** The y of a rail band's top, counting from the canvas origin. Band zero is the first rail. */
export const railTop = (index: number): number => LAYOUT.chromeHeight + index * LAYOUT.railHeight

const WITHIN_RAIL: Readonly<Record<'line' | 'bar' | 'item', number>> = {
  line: LAYOUT.lineTop,
  bar: LAYOUT.barTop,
  item: LAYOUT.itemTop,
}

/**
 * The y of one part inside a rail band, measured from that band's own top.
 *
 * A band is a stack of fixed offsets, so a second rail is the first one shifted by
 * {@link LAYOUT}.railHeight and nothing about a part's place inside it is recomputed per rail.
 */
export const insideRail = (top: number, part: 'line' | 'bar' | 'item'): number =>
  top + WITHIN_RAIL[part]

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

/**
 * What each rail is called, keyed by epic id.
 *
 * A `RailBox` carries its `epicId` and not its name, because the geometry has no use for one. The
 * table imports this rather than writing its own join, so the two cannot disagree about what to call
 * a rail no epic claims.
 */
export const railNames = (plan: PlanScreenModel): ReadonlyMap<string, string> =>
  new Map(plan.epics.map((epic) => [epic.id, epic.name]))

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

  /**
   * How wide the plan's own days are, which is what the element is floored at.
   *
   * A short plan scrolls no further than it runs, so this is the `minWidth` and not what anything is
   * drawn to. {@link CanvasLayout.drawnWidth} is that.
   */
  readonly width: number

  /**
   * How wide every layer inside the canvas is drawn: the width of the **bled** range.
   *
   * The grid was bled from the start and the rail bands were not, which is what left each row's
   * structure ending at the plan's own last day while the chrome carried on past it — a canvas that
   * visibly stops a few hundred pixels short of the pane it is in. One number reaching both layers is
   * the whole fix, and it is on the layout rather than computed twice so the two cannot drift apart.
   *
   * It is deliberately **not** the `minWidth`: flooring the element at the bled width would give every
   * plan 120 working days of empty axis to scroll through.
   */
  readonly drawnWidth: number

  readonly arcs: readonly CanvasArc[]

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
    arcs: canvasArcs(plan, rails, ARC_METRICS[rung]),
    height: canvasHeight(rails.length),
    width: canvasWidth(scale, range),
    drawnWidth: canvasWidth(scale, chromeRange(range)),
    frame: {
      marks: marksByFeature(itemsToMarks(plan, plan.schedule, scale)),
      treatments: withProgress(treatmentsOf(plan.schedule), progress),
      groups: groupsOf(plan),
      hues: labelHues(plan),
      draws: DRAWS[rung],
      rails: railNames(plan),
      details: detailsOf(plan),
      names: namesOf(plan),
      search: featureSearch(plan),
      hrefOf: query.hrefOf,
    },
  }
}

/** The x of the first day on screen, which is where the axis begins and the drag stops refusing. */
export const axisX = (scale: PlanScale, range: DayRange): number => dayToX(range.fromDay, scale)
