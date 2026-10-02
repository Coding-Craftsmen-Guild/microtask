import { xToDay, type PlanScale, type RailBox } from '@repo/canvas'
import { splitDetail } from './detail-lines'
import type { DrawnAt } from './extend-view'
import { railsFrom } from './selection'
import { LAYOUT } from './view'

const MARK = '[data-slot="feature-bar"],[data-slot="item-mark"]'

const HANDLE = '[data-slot="extend-handle"]'

const CANVAS = '[data-slot="plan-canvas"]'

const RAIL = '[data-slot="rail"]'

const FALLBACK_HUE = 'var(--color-chart-3)'

const SEPARATOR = ' '

const textAt = (node: Element, name: string): string => node.getAttribute(name) ?? ''

const numberAt = (node: Element, name: string): number => Number(node.getAttribute(name))

/** The mark under the pointer: where it is, what it is, and what a draw from it would extend. */
export interface Hovered {
  /** Whether it is a feature or one of a feature's items. */
  readonly kind: 'feature' | 'item'

  /** Its own id. */
  readonly subjectId: string

  /** Its name, for the chip a drag draws. */
  readonly name: string

  /** The feature in play: itself, or the feature an item belongs to. */
  readonly featureId: string

  /** That feature's group, which a new feature drawn from it inherits; `''` for none. */
  readonly labelId: string

  /** The rail it sits on. */
  readonly epicId: string

  /** Where it sits among its siblings, which is what "after it" is counted from. */
  readonly position: number

  /** The first day it occupies. */
  readonly startDay: number

  /** The first day after it. */
  readonly endDay: number

  /** Its left edge, in canvas coordinates. */
  readonly x: number

  /** Its width. */
  readonly width: number

  /** The middle of it, vertically, which is where both handles sit. */
  readonly y: number

  /** The hue it is painted in, which the handles are painted in too. */
  readonly colour: string

  /** Whether the rung draws it as a line, whose own diamonds the handles take the place of. */
  readonly diamond: boolean
}

const hueOfMark = (node: Element): string => {
  const style = node instanceof SVGElement ? node.style : null
  if (style === null) return FALLBACK_HUE
  const named = style.getPropertyValue('--mark-hue')
  const painted = [named, style.stroke, style.fill].find((one) => one !== '')
  return painted ?? FALLBACK_HUE
}

const topOf = (node: Element): number =>
  Number(node.getAttribute('data-y') ?? node.getAttribute('y') ?? 0)

const middleOf = (node: Element, line: boolean, item: boolean): number => {
  if (line) return topOf(node)
  return topOf(node) + (item ? LAYOUT.itemHeight : LAYOUT.barHeight) / 2
}

const widthOf = (node: Element, item: boolean): { readonly x: number; readonly width: number } => {
  if (item) return { width: Number(node.getAttribute('width')), x: Number(node.getAttribute('x')) }
  if (node.tagName === 'circle') {
    const radius = Number(node.getAttribute('r'))
    return { width: radius * 2, x: Number(node.getAttribute('cx')) - radius }
  }
  return { width: numberAt(node, 'data-width'), x: numberAt(node, 'data-x') }
}

const positionOf = (node: Element, rail: Element | null, item: boolean, id: string): number => {
  if (item) return numberAt(node, 'data-position')
  const ids = textAt(rail ?? node, 'data-feature-ids').split(SEPARATOR)
  return Math.max(ids.indexOf(id), 0)
}

/**
 * The mark a pointer is over, read straight off the element it is on.
 *
 * Everything a draw needs is already on these elements, which is what lets the canvas stay a Server
 * Component: the island is handed the board rather than the plan. The ids, the days and the geometry are
 * attributes the mark carries for its own sake; the name comes out of the hover card's own text, so
 * neither a name nor a hue had to be added to two thousand item marks to make this gesture possible
 * (`./item-mark.tsx` argues the three that were).
 *
 * ### Why `x` and `width` are the drawn mark and the days are the span
 *
 * The two are the same thing for a feature **line**, whose rule runs the length of its span, and they
 * are not for either of the other marks. An item bar is inset at both ends, and a feature at the Year
 * and Quarter stops is a **point** at the middle of days it does not otherwise cover: taking the span
 * there put the handles at the span's edges, which for a ten-day feature at Quarter is seventy pixels
 * of empty track to either side of the dot — two `+` floating clear of the only thing the pointer was
 * on. So each shape is asked for its own drawn extent, and only the days come from the attributes.
 *
 * That is the same split `./feature-point.tsx` makes, for the same reason: what a draw extends from is
 * the span, and what a reader reaches for is the mark.
 *
 * @param target - Whatever a pointer event named as its target.
 * @returns The mark under it, or `null` for a pointer that is not over one.
 */
export function markFrom(target: EventTarget | null): Hovered | null {
  const node = target instanceof Element ? target.closest(MARK) : null
  if (node === null) return null
  const rail = node.closest(RAIL)
  const epicId = textAt(rail ?? node, 'data-epic-id')
  const item = node.getAttribute('data-item-id') !== null
  const subjectId = item ? textAt(node, 'data-item-id') : textAt(node, 'data-feature-id')
  const featureId = textAt(node, 'data-hover-id')
  if (epicId === '' || subjectId === '' || featureId === '') return null
  const line = node.getAttribute('data-line') !== null
  return {
    ...widthOf(node, item),
    colour: hueOfMark(node),
    diamond: line,
    endDay: numberAt(node, 'data-end-day'),
    epicId,
    featureId,
    kind: item ? 'item' : 'feature',
    labelId: textAt(node, 'data-label-id'),
    name: splitDetail(textAt(node, 'data-detail')).title,
    position: positionOf(node, rail, item, subjectId),
    startDay: numberAt(node, 'data-start-day'),
    subjectId,
    y: middleOf(node, line, item),
  }
}

/** Whether a pointer is over one of the two handles, in which case the hovered mark must not change. */
export const onHandle = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(HANDLE) !== null

/** Where a pointer is, in the page's own coordinates. */
export interface Pointer {
  /** Its x, as a pointer event reports it. */
  readonly clientX: number

  /** Its y. */
  readonly clientY: number
}

/** The board a draw is happening over: the SVG, the rails on it, and what a day is worth in px. */
export interface Board {
  /** The SVG itself, which every coordinate below is relative to. */
  readonly canvas: Element

  /** The rails as the DOM holds them, in the order they are drawn. */
  readonly rails: readonly RailBox[]

  /** The scale, for turning an x back into a day. */
  readonly scale: PlanScale
}

/**
 * The board under a pointer, or `null` when there is no canvas to measure against.
 *
 * @param frame - The island's own element, which the canvas is somewhere inside.
 * @param scale - What a day is worth in px.
 * @returns The canvas, its rails and the scale, read fresh so a revalidated board is never stale.
 */
export function boardIn(frame: Element | null, scale: PlanScale): Board | null {
  const canvas = frame?.querySelector(CANVAS) ?? null
  return canvas === null ? null : { canvas, rails: railsFrom(canvas), scale }
}

const railNameOf = (canvas: Element, epicId: string): string => {
  if (epicId === '') return ''
  const rail = canvas.querySelector(`${RAIL}[data-epic-id="${epicId}"]`)
  return rail === null ? '' : textAt(rail, 'data-name')
}

/**
 * Where the pointer is on the board: which day, which lane, and that lane's rail.
 *
 * `before` is answered as `0` here and worked out again at the release, because it is counted from the
 * **drawn start** rather than from the pointer: a drag from an end handle leftwards draws a bar whose
 * start is the source's own end day, which is not where the pointer is (`./extend-view.ts`).
 *
 * @param board - The canvas, its rails and the scale.
 * @param at - The pointer.
 * @returns The day, the lane and the rail under it; the lane is `null` off the rails.
 */
export function pointerAt(board: Board, at: Pointer): DrawnAt {
  const box = board.canvas.getBoundingClientRect()
  const index = Math.floor((at.clientY - box.top) / LAYOUT.railHeight)
  const lane = index >= 0 && index < board.rails.length ? index : null
  const rail = lane === null ? undefined : board.rails[lane]
  return {
    before: 0,
    day: xToDay(at.clientX - box.left, board.scale),
    epicId: rail?.epicId ?? '',
    lane,
    railName: railNameOf(board.canvas, rail?.epicId ?? ''),
  }
}

/**
 * How many features on a rail start before a day, which is where a new one lands among them.
 *
 * Counted from the bars the board is drawing rather than from stored positions, because the question is
 * about the order a reader can see: a feature drawn into the middle of a rail should land between the two
 * bars it was drawn between. A rail with features the schedule could not place draws fewer bars than it
 * holds features, and those are exactly the ones with no day to compare against.
 *
 * @param rails - The rails as the DOM holds them.
 * @param lane - Which one, or `null` for a pointer off the rails.
 * @param day - The drawn start.
 * @returns A position among that rail's features.
 */
export const beforeOn = (rails: readonly RailBox[], lane: number | null, day: number): number => {
  if (lane === null) return 0
  const bars = rails[lane]?.bars ?? []
  return bars.filter((bar) => bar.startDay <= day).length
}
