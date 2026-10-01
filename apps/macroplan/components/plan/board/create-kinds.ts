/** The three things the Add strip makes, which is the whole hierarchy a plan holds. */
export type CreateKind = 'epic' | 'feature' | 'item'

/** The order the strip offers them in: outermost first, which is how the plan nests. */
export const CREATE_KINDS: readonly CreateKind[] = ['epic', 'feature', 'item']

/**
 * The `dataTransfer` type a dragged pill is carried under.
 *
 * A custom MIME type rather than `text/plain`, so that a drag from somewhere else — a word selected
 * in another tab, a file from the desktop — does not look like a pill to the board's drop handler.
 * `dataTransfer.types.includes` is readable during `dragover`, where the **value** is deliberately
 * not: the platform withholds payloads until the drop, so a drop target may know what kind of thing
 * is coming only by the type it is offered under. That is the whole reason the kind is in the type
 * and not in the data.
 */
export const DRAG_TYPE = 'application/x-macroplan-add'

/** The same, one type per kind, so the drop knows what it was given before it is given it. */
export const dragTypeOf = (kind: CreateKind): string => `${DRAG_TYPE}+${kind}`

/** Which kind a `dataTransfer`'s types name, or `null` for a drag that is not one of these. */
export const kindOfTypes = (types: readonly string[]): CreateKind | null =>
  CREATE_KINDS.find((kind) => types.includes(dragTypeOf(kind))) ?? null

/** What each pill says, and what the strip calls itself. */
export const CREATE_WORDS = {
  add: 'ADD',
  epic: 'Epic',
  feature: 'Feature',
  item: 'Item',
} as const

/**
 * What the hint says while nothing is being dragged, and while each kind is.
 *
 * The idle sentence names the gestures this strip is the only sign of, which is the whole reason the
 * strip has a hint at all: a pill that can be dragged somewhere looks exactly like a button, and the
 * board it is dragged onto gives no sign of taking a drop until something is over it.
 *
 * Each dragging sentence says **where** the drop lands rather than what it makes, because the pill in
 * the pointer already says what it makes. They are what a reader has instead of a tooltip, and they
 * change the moment a drag starts rather than the moment it is over something — a hint that only
 * appears once you are already in the right place is a hint for somebody who did not need it.
 */
export const CREATE_HINTS: Readonly<Record<'idle' | CreateKind, string>> = {
  idle: 'Drag a pill onto the board to add it. Click a rail’s name to open it, or its swatch to light that lane.',
  epic: 'Drop between two rails to insert a new epic there, or below them all to add one at the end.',
  feature: 'Drop on a rail, at the sprint you want it to start in. Its sprint is a floor, not a date.',
  item: 'Drop inside a feature. It is added at the end of that feature’s items.',
}

/**
 * What each newly dropped thing is called before anybody has named it.
 *
 * A name and not an empty one, because `EntityName` refuses empty and because a drop that produced a
 * nameless row would be a row a reader has to guess the purpose of. The drawer the drop opens is
 * where it gets its real name, with the field already on screen.
 */
export const CREATE_NAMES: Readonly<Record<CreateKind, string>> = {
  epic: 'New epic',
  feature: 'New feature',
  item: 'New item',
}

/**
 * How many days of work a dropped feature and its first item are given.
 *
 * Two, because a feature with no estimate has no bar at all — it lands in the unscheduled tray, which
 * is the one place a reader who has just dropped something on the board will not look for it. Two
 * working days is the smallest span wide enough to see at every stop.
 */
export const DROPPED_ESTIMATE = 2
