import { splitDetail } from '../canvas/detail-lines'
import type { ItemSlot } from './create-drop'

const RAIL = '[data-slot="rail"]'

const textAt = (node: Element, name: string): string => node.getAttribute(name) ?? ''

const numberAt = (node: Element, name: string): number => Number(node.getAttribute(name))

const markOf = (canvas: Element, featureId: string): Element | null =>
  canvas.querySelector(`[data-feature-id="${featureId}"]`)

/**
 * What one feature is called, read off the mark the board drew for it.
 *
 * The hover card's own text, which every mark carries for its own sake: the title is its first line, so a
 * chip that names a feature needs no second source for the name and nothing had to be added to the mark to
 * make the drop legible (`canvas/detail-lines.ts`).
 *
 * @param canvas - The SVG the drop is over.
 * @param featureId - The feature to name.
 * @returns Its name, or `''` for a feature the board drew no mark for.
 */
export const featureNameOf = (canvas: Element, featureId: string): string => {
  const mark = markOf(canvas, featureId)
  return mark === null ? '' : splitDetail(textAt(mark, 'data-detail')).title
}

/**
 * Which group a feature is in, so work dropped after it can join the same one.
 *
 * @param canvas - The SVG the drop is over.
 * @param featureId - The feature to read.
 * @returns Its group's id, or `''` for a feature in none.
 */
export const featureLabelOf = (canvas: Element, featureId: string): string => {
  const mark = markOf(canvas, featureId)
  return mark === null ? '' : textAt(mark, 'data-label-id')
}

/**
 * What one rail is called, for the chip of a drop that lands on it.
 *
 * @param canvas - The SVG the drop is over.
 * @param epicId - The rail to name.
 * @returns Its name, or `''` for a rail the board drew no row for.
 */
export const railNameOf = (canvas: Element, epicId: string): string => {
  const rail = canvas.querySelector(`${RAIL}[data-epic-id="${epicId}"]`)
  return rail === null ? '' : textAt(rail, 'data-name')
}

/**
 * The items of one feature, in the order the board drew them.
 *
 * Read from the DOM rather than from the schedule, because the question a dropped item is answering is
 * "which gap on screen", and the only thing that knows where the gaps are drawn is the drawing. Sorted by
 * the position each mark carries, so the order is the stored one and not whatever order the query
 * answered in.
 *
 * @param canvas - The SVG the drop is over.
 * @param featureId - The feature whose items to read.
 * @returns One slot per item, in stored order.
 */
export const itemsOf = (canvas: Element, featureId: string): readonly ItemSlot[] =>
  [...canvas.querySelectorAll(`[data-slot="item-mark"][data-hover-id="${featureId}"]`)]
    .map((node) => ({
      id: textAt(node, 'data-item-id'),
      position: numberAt(node, 'data-position'),
      width: numberAt(node, 'width'),
      x: numberAt(node, 'x'),
    }))
    .sort((a, b) => a.position - b.position)
    .map(({ id, width, x }) => ({ id, width, x }))
