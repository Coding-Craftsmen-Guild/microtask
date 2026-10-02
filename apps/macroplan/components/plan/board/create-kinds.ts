/** What a pill on the Add strip makes when it is dropped on the board. */
export type CreateKind = 'epic' | 'feature' | 'item'

/** The three pills, in the order they are offered: outside in, biggest first. */
export const CREATE_KINDS: readonly CreateKind[] = ['epic', 'feature', 'item']

/**
 * Everything the board accepts a drop of, which is the three creates plus a rail being moved.
 *
 * A rail drag is the odd one out and deliberately in the same list: it lands in a **gap** between rails
 * exactly as a new epic does, draws the same insertion line, and is answered by the same drop handler. The
 * only difference is which write it ends in, so keeping them apart would have meant two of everything
 * between the pointer and that choice.
 */
export type DragKind = CreateKind | 'rail'

const DRAG_TYPE = 'application/x-macroplan-add'

/** The drag type a rail row carries, which is what makes a reorder legible to the board's drop root. */
export const RAIL_DRAG_TYPE = 'application/x-macroplan-move+rail'

/**
 * The MIME-ish type one kind of drag announces itself with.
 *
 * A type and not a payload, because `dataTransfer.getData` is **unreadable during a drag**: the browser
 * only hands the data over on the drop, so anything the preview needs has to be in the type itself. What
 * the preview needs is the kind, and nothing more.
 *
 * @param kind - What is being dragged.
 * @returns The type to set on the drag and to look for while it is over the board.
 */
export const dragTypeOf = (kind: DragKind): string =>
  kind === 'rail' ? RAIL_DRAG_TYPE : `${DRAG_TYPE}+${kind}`

const DRAG_KINDS: readonly DragKind[] = [...CREATE_KINDS, 'rail']

/**
 * Which kind of drag is over the board, read off the types it carries.
 *
 * @param types - `dataTransfer.types`, which is readable throughout a drag.
 * @returns The kind, or `null` for a drag that is none of this board's business.
 */
export const kindOfTypes = (types: readonly string[]): DragKind | null =>
  DRAG_KINDS.find((kind) => types.includes(dragTypeOf(kind))) ?? null

/** What the strip and its three pills are called. */
export const CREATE_WORDS = {
  add: 'ADD',
  epic: 'Epic',
  feature: 'Feature',
  item: 'Item',
} as const

/**
 * The sentence under the strip, which changes as soon as something is picked up.
 *
 * One per kind, because what a drop means is different for each: a rail lands between two rails, a feature
 * on a lane at a day, an item inside a feature. The idle line is what the strip says the rest of the time.
 */
export const CREATE_HINTS: Readonly<Record<'idle' | DragKind, string>> = {
  idle: 'Drag a pill onto the board to add it, or a rail by its grip to reorder the rails. Click a rail’s name to open it, or its swatch to light that lane.',
  epic: 'Drop between two rails to insert a new epic there, or below them all to add one at the end.',
  feature:
    'Drop on a rail. Near the end of a feature it goes after it and takes its group; anywhere else it starts in the sprint you dropped it in.',
  item: 'Drop inside a feature. It lands between the items under the pointer.',
  rail: 'Drop between two rails to move this one there.',
}

/** What a dropped thing is called before anybody renames it. */
export const CREATE_NAMES: Readonly<Record<CreateKind, string>> = {
  epic: 'New epic',
  feature: 'New feature',
  item: 'New item',
}

/**
 * How long a dropped piece of work is, in days.
 *
 * Two days rather than one, because a one-day bar at Quarter zoom is four pixels wide and a reader who
 * has just made something needs to see where it landed. It is an estimate like any other and the panel's
 * stepper is next to it.
 */
export const DROPPED_ESTIMATE = 2

/** How near the end of a feature a drop has to be to land after it, in working days. */
export const AFTER_WITHIN = 1.5
