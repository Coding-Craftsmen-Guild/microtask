const DASH = String.fromCharCode(0x2013)

const MIDDOT = String.fromCharCode(0xb7)

/** The finest a drawn length may be, which is the grain every estimate in this product is in. */
export const DRAWN_GRAIN = 0.5

/** What a new feature and a new item drawn on the board are called. */
export const DRAWN_NAMES = { feature: 'New feature', item: 'New item' } as const

/** Which end of a mark a draw started from. */
export type DrawnSide = 'start' | 'end'

/** The mark a draw started from, read off its handle in the DOM. */
export interface Drawn {
  /** Whether the source is a feature or one of a feature's items. */
  readonly kind: 'feature' | 'item'

  /** Which end of it the handle is on. */
  readonly side: DrawnSide

  /** The source's own id. */
  readonly subjectId: string

  /** Its name, for the chip. */
  readonly name: string

  /** The feature in play: the source, or the feature an item belongs to. */
  readonly featureId: string

  /** That feature's group, which a new feature drawn from it inherits; `''` for none. */
  readonly labelId: string

  /** The rail the source sits on. */
  readonly epicId: string

  /** Where the source sits among its siblings, which is what "after it" is counted from. */
  readonly position: number

  /** The day the draw starts from: the source's end day, or its start day. */
  readonly originDay: number
}

/** Where the pointer is now, in the board's own coordinates. */
export interface DrawnAt {
  /** The day under the pointer, before snapping. */
  readonly day: number

  /** The rail under the pointer, or `null` for a pointer off the rails. */
  readonly lane: number | null

  /** That rail's id, `''` where there is none. */
  readonly epicId: string

  /** That rail's name, for the chip. */
  readonly railName: string

  /** How many features on that rail start before the drawn start, which is where a new one lands. */
  readonly before: number
}

/** What the pointer has drawn: a span, a lane, and the words over it. */
export interface DrawAim {
  /** The first day of the provisional bar. */
  readonly fromDay: number

  /** Its last day, exclusive. */
  readonly toDay: number

  /** Its length in days, never less than {@link DRAWN_GRAIN}. */
  readonly days: number

  /** The lane it is drawn in. */
  readonly lane: number

  /** Whether that is the lane the source is on, which is what decides *what* gets created. */
  readonly sameLane: boolean

  /** What will be made, as a sentence. */
  readonly chip: string

  /** How long it is and which sprints it covers, in the chip's second colour. */
  readonly meta: string
}

/** What a release creates, which is everything `./extend-write.ts` needs and nothing about pixels. */
export interface Draft {
  /** An item inside the source's feature, or a feature on a rail. */
  readonly kind: 'feature' | 'item'

  /** The feature in play: a new item's parent, or the feature at the other end of the dependency. */
  readonly featureId: string

  /** The rail a new feature lands on. */
  readonly epicId: string

  /** Where it lands among its siblings. */
  readonly position: number

  /** How many days of work it is, which sizes the item that carries the estimate. */
  readonly days: number

  /** The group a new feature joins, `''` for none. */
  readonly labelId: string

  /** The sprint a new feature may not start before, or `null` for one the schedule places freely. */
  readonly sprint: number | null

  /** Which way the dependency runs, or `none` for a draw that makes no edge. */
  readonly edge: 'new-waits' | 'source-waits' | 'none'
}

const snap = (day: number): number => Math.round(day / DRAWN_GRAIN) * DRAWN_GRAIN

const sprintOf = (day: number, sprintLengthDays: number): number =>
  Math.max(Math.floor(day / sprintLengthDays), 0)

const sprintWords = (aim: { readonly fromDay: number; readonly toDay: number }, length: number): string => {
  const from = sprintOf(aim.fromDay, length)
  const to = sprintOf(Math.max(aim.fromDay, aim.toDay - DRAWN_GRAIN), length)
  return from === to ? `S${String(from + 1)}` : `S${String(from + 1)}${DASH}S${String(to + 1)}`
}

const quoted = (name: string): string => `${String.fromCharCode(0x201c)}${name}${String.fromCharCode(0x201d)}`

const sameLaneChip = (drawn: Drawn): string => {
  const what = drawn.kind === 'item' ? DRAWN_NAMES.item : DRAWN_NAMES.feature
  const where = drawn.side === 'end' ? 'after' : 'before'
  return `${what} ${where} ${quoted(drawn.name)}`
}

const otherLaneChip = (drawn: Drawn, railName: string): string => {
  const how = drawn.side === 'end' ? 'waits for' : 'unblocks'
  return `${DRAWN_NAMES.feature} on ${railName} ${MIDDOT} ${how} ${quoted(drawn.name)}`
}

/**
 * The span a drag has drawn, snapped to half days and never shorter than one.
 *
 * The origin is the end of the source the handle is on, and the pointer is the free edge: rightward
 * from an end handle, leftward from a start handle. Both are clamped so the bar keeps at least the
 * grain the contract estimates in — a drag that has barely moved draws half a day rather than a bar of
 * nothing, which is what makes the first pixel of the gesture legible.
 *
 * @param drawn - The mark the draw started from.
 * @param at - Where the pointer is now.
 * @param sprintLengthDays - The plan's sprint length, for the chip's second half.
 * @returns The span, the lane, and the two strings the chip is built from.
 */
export function aimOf(drawn: Drawn, at: DrawnAt, sprintLengthDays: number): DrawAim {
  const reach = snap(at.day)
  const forward = drawn.side === 'end'
  const fromDay = forward ? drawn.originDay : Math.min(reach, drawn.originDay - DRAWN_GRAIN)
  const toDay = forward ? Math.max(reach, drawn.originDay + DRAWN_GRAIN) : drawn.originDay
  const span = { fromDay: Math.max(fromDay, 0), toDay: Math.max(toDay, DRAWN_GRAIN) }
  const sameLane = at.epicId === drawn.epicId
  return {
    ...span,
    chip: sameLane ? sameLaneChip(drawn) : otherLaneChip(drawn, at.railName),
    days: span.toDay - span.fromDay,
    lane: at.lane ?? 0,
    meta: `${String(span.toDay - span.fromDay)}d ${MIDDOT} ${sprintWords(span, sprintLengthDays)}`,
    sameLane,
  }
}

/**
 * What a release creates, which is a different thing in the same lane and in another one.
 *
 * In the **same** lane a draw extends the thing it came from: another item in that feature, or another
 * feature on that rail, before or after the source. In **another** lane it is always a feature, because
 * an item belongs to one feature and a feature belongs to one rail — so a draw that crosses lanes is a
 * draw about a different rail's work, and the only thing that can carry it there is a feature.
 *
 * The dependency follows the end that was grabbed and not the lane: dragging from an **end** means "this
 * comes after that", so the new work waits on the source; dragging from a **start** means the reverse.
 * That is the one rule a reader can hold, and it is why the arrow on the board points the way it does.
 *
 * A cross-lane draw also pins the sprint it was drawn in, because the drawn start is the whole of what a
 * reader said: a pin is a floor, so it delays the new feature to where it was drawn and never moves it
 * earlier than the schedule would have put it anyway.
 *
 * @param drawn - The mark the draw started from.
 * @param aim - What the pointer drew.
 * @param at - Where the pointer landed.
 * @param sprintLengthDays - The plan's sprint length, for the pin.
 * @returns What to create, or `null` for a release on nothing.
 */
export function draftOf(
  drawn: Drawn,
  aim: DrawAim,
  at: DrawnAt,
  sprintLengthDays: number,
): Draft | null {
  if (at.lane === null) return null
  const edge = drawn.side === 'end' ? 'new-waits' : 'source-waits'
  const shared = { days: aim.days, featureId: drawn.featureId, labelId: drawn.labelId }
  if (!aim.sameLane) {
    return {
      ...shared,
      edge,
      epicId: at.epicId,
      kind: 'feature',
      position: at.before,
      sprint: sprintOf(aim.fromDay, sprintLengthDays),
    }
  }
  const after = drawn.side === 'end' ? 1 : 0
  if (drawn.kind === 'item') {
    return {
      ...shared,
      edge: 'none',
      epicId: drawn.epicId,
      kind: 'item',
      position: drawn.position + after,
      sprint: null,
    }
  }
  return {
    ...shared,
    edge,
    epicId: drawn.epicId,
    kind: 'feature',
    position: drawn.position + after,
    sprint: null,
  }
}
