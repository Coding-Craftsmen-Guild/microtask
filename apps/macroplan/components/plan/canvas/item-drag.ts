import { xToDay, type PlanScale } from '@repo/canvas'
import { itemsOf } from '../board/create-dom'
import { featureAt, insertAt, laneAt } from '../board/create-drop'
import { railsFrom } from './selection'
import { insideRail, LAYOUT, railTop } from './view'

const MARK = '[data-slot="item-mark"]'

const RAIL = '[data-slot="rail"]'

const numberAt = (node: Element, name: string): number => Number(node.getAttribute(name))

const textAt = (node: Element, name: string): string => node.getAttribute(name) ?? ''

/** How far a pointer travelled from where it went down, in px. */
export interface Travel {
  readonly x: number

  readonly y: number
}

/** An item being dragged: what it is, where it was drawn, and where it already belongs. */
export interface ItemHeld {
  readonly itemId: string

  /** The feature it belongs to **now**, which is what a landing is compared against. */
  readonly featureId: string

  /** Where it sits among that feature's items now, for the same comparison. */
  readonly position: number

  readonly x: number

  readonly y: number

  readonly width: number

  /** The top of the band it was drawn in, which the travel is added to. */
  readonly railTop: number

  /** How big the canvas is, so the ghost over it is the same size. */
  readonly box: { readonly width: number; readonly height: number }

  readonly travelled: Travel
}

/** Where a dragged item would land: a feature, and a place among its items. */
export interface ItemLanding {
  readonly featureId: string

  readonly position: number
}

const NOWHERE: Travel = { x: 0, y: 0 }

/**
 * An item drag begun on whatever a pointer went down on, or `null` when it was not an item.
 *
 * ### Why an item is dragged at all
 *
 * A feature could be moved to another rail from the first revision and an item could be moved nowhere:
 * the only way to put a sub-task under a different feature was to delete it and type it again. There is
 * nothing special about an item that justified that — `placeItem` has always existed, and it is what the
 * drawer's own `Move up` / `Move down` spend.
 *
 * ### Why it reads the drawn rect and not `data-x`
 *
 * An item mark carries no `data-x`: it is drawn inset by `ITEM_GAP` and the inset **is** its geometry,
 * because nothing re-derives an item's span from pixels — `./item-mark.tsx` says why it carries
 * `data-start-day` instead. So the ghost follows the rect the reader can see, which is the rect they
 * grabbed.
 *
 * @param target - `event.target` from the `pointerdown`.
 * @param canvas - The canvas's `<svg>`, which the band index is counted within.
 * @returns The drag to hold, or `null` for a pointer that hit no item.
 */
export function itemHeldFrom(target: EventTarget | null, canvas: Element): ItemHeld | null {
  const node = target instanceof Element ? target.closest(MARK) : null
  const rail = node?.closest(RAIL) ?? null
  if (node === null || rail === null) return null
  const lane = [...canvas.querySelectorAll(RAIL)].indexOf(rail)
  const itemId = textAt(node, 'data-item-id')
  if (lane === -1 || itemId === '') return null
  return {
    box: { height: numberAt(canvas, 'height'), width: numberAt(canvas, 'width') },
    featureId: textAt(node, 'data-hover-id'),
    itemId,
    position: numberAt(node, 'data-position'),
    railTop: railTop(lane),
    travelled: NOWHERE,
    width: numberAt(node, 'width'),
    x: numberAt(node, 'x'),
    y: insideRail(railTop(lane), 'item'),
  }
}

/**
 * Which feature a dragged item would join, and where among its items.
 *
 * ### Why it is answered against the markup
 *
 * The same argument `./selection.ts` makes for a feature's drop, and the same helpers the strip's own
 * drop already uses (`../board/create-drop.ts`): a client component may be handed primitives, an unbound
 * function or `null` and nothing else, so the layout cannot cross as a prop — and answering against the
 * SVG means answering against the one copy of it the reader can see.
 *
 * ### Why the item takes itself out of the list first
 *
 * `insertAt` counts the items whose middle is left of the pointer, which is a slot in the list **as
 * drawn**. Dragging an item within its own feature means the list still holds it, so every slot past its
 * own is one too high: moving the second of four items to the end would answer 4 for a list that will
 * have three items in it once it is removed, and the write would be rejected or clamped. Taking it out
 * first makes the count a slot in the list the write will act on.
 *
 * ### Why the probe is the item's middle
 *
 * Its **left edge** is what first stood here, which is what a feature's own drag is answered against. For
 * a bar that is right: a bar is wide, and its left edge is the day it starts, which is the thing being
 * placed. An item is dragged by a pointer somewhere inside it, so a probe at its left edge asks whether
 * the *corner* of the ghost is over the target — and a drop that visually covered the feature it was
 * aimed at was refused whenever the pointer sat in the right-hand half of the mark.
 *
 * The middle is what the eye uses and it needs no measurement: the grab offset inside the mark would
 * mean a `getBoundingClientRect`, which `happy-dom` answers with zeros (ADR 0055), and `x + width / 2`
 * is two numbers the mark already carries.
 *
 * A drop on no rail, past the last rail, or in the space between two features answers `null`. None of
 * those is an error and none is clamped to the nearest feature — the same rule a feature's own drop
 * follows, and for the reason §6 gives: nothing on this board is ever auto-moved.
 *
 * @param held - The drag, with its travel.
 * @param canvas - The canvas's `<svg>`.
 * @param scale - The scale the bars were drawn at, for turning an x back into a day.
 * @returns The feature and the place, or `null` for a drop that names neither.
 */
export function itemLandingAt(held: ItemHeld, canvas: Element, scale: PlanScale): ItemLanding | null {
  const point = {
    x: held.x + held.width / 2 + held.travelled.x,
    y: held.y + LAYOUT.itemHeight / 2 + held.travelled.y,
  }
  const rails = railsFrom(canvas)
  const lane = laneAt(point.y, rails.length)
  const rail = lane === null ? undefined : rails[lane]
  const bar = rail === undefined ? null : featureAt(rail, xToDay(point.x, scale))
  if (bar === null) return null
  const others = itemsOf(canvas, bar.id).filter((one) => one.id !== held.itemId)
  return { featureId: bar.id, position: insertAt(point.x, others) }
}

/**
 * Whether a landing is somewhere the item already is, which is a drop that must write nothing.
 *
 * The no-op half of the same rule a feature's drop follows: a drop a reader could not have seen the
 * result of is not a write. Within one feature the two numbers are compared directly; a different
 * feature is always a move, whatever the place in it.
 */
export const itemUnmoved = (held: ItemHeld, landing: ItemLanding): boolean =>
  landing.featureId === held.featureId && landing.position === held.position
