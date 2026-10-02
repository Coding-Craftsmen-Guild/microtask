import type { Hovered } from './extend-dom'
import { DRAWN_GRAIN, type DrawnSide } from './extend-view'

const MIDDOT = String.fromCharCode(0xb7)

const DASH = String.fromCharCode(0x2013)

const quoted = (name: string): string =>
  `${String.fromCharCode(0x201c)}${name}${String.fromCharCode(0x201d)}`

/** What the chip says for a feature whose length is its items' and not its own. */
export const BROKEN_DOWN = 'Sized by its items'

/** The mark being resized, as `./extend-dom.ts` read it off the board. */
export interface Sized {
  readonly kind: 'feature' | 'item'

  readonly subjectId: string

  readonly name: string

  /** The lane it is on, which a resize never leaves. */
  readonly lane: number

  readonly startDay: number

  readonly endDay: number

  /**
   * Whether this mark's drawn length is decided by something other than its own estimate.
   *
   * True only for a **feature with estimated items**. ADR 0051 is explicit that both estimates are kept
   * and that placement takes the children whenever at least one of them carries an estimate — so writing
   * such a feature's own estimate is a real write that moves nothing on screen, which is the one outcome
   * a drag must not have. The gesture is offered and refused with {@link BROKEN_DOWN} rather than hidden,
   * because a handle that is missing on some features and not others is a rule nobody can infer.
   */
  readonly brokenDown: boolean
}

/** What a resize would do: the span to draw, the length to write, and the words over it. */
export interface SizeAim {
  /** The first day of the provisional bar. */
  readonly fromDay: number

  /** Its last day, exclusive. */
  readonly toDay: number

  /** The estimate a release would write, in days. */
  readonly days: number

  readonly lane: number

  /** Whether a release would write nothing, which is drawn as a refusal. */
  readonly refused: boolean

  readonly chip: string

  readonly meta: string
}

const snap = (day: number): number => Math.round(day / DRAWN_GRAIN) * DRAWN_GRAIN

const sprintOf = (day: number, length: number): number => Math.max(Math.floor(day / length), 0)

const sprintWords = (from: number, to: number, length: number): string => {
  const first = sprintOf(from, length)
  const last = sprintOf(Math.max(from, to - DRAWN_GRAIN), length)
  return first === last ? `S${String(first + 1)}` : `S${String(first + 1)}${DASH}S${String(last + 1)}`
}

/**
 * The span a resize has dragged out, snapped to half days and never shorter than one grain.
 *
 * ### Which edge moves
 *
 * The one that was grabbed, and only that one. From an **end** handle the start stays put and the
 * pointer is the new end; from a **start** handle the end stays put and the pointer is the new start.
 * Both are clamped so the mark keeps at least the grain the contract estimates in, which is what makes a
 * drag past the opposite edge read as "as short as this can be" rather than as a bar inside out.
 *
 * ### What is written is a length, not a date
 *
 * Only `days` leaves this function for the write. A feature's **start** is the schedule's to decide —
 * it is derived from rail order, dependencies and pins (`@repo/schedule`) — so dragging a start handle
 * leftwards does not move the mark leftwards: it says the work is longer, and where the longer work then
 * sits is the forward pass's answer. The provisional bar is drawn from the dragged edge because that is
 * where the pointer is, and the chip says the length, which is the thing that is actually being chosen.
 *
 * A mark whose length is not its own to choose is refused: see {@link Sized.brokenDown}.
 *
 * @param sized - The mark the drag started on.
 * @param side - Which handle was grabbed.
 * @param day - The day under the pointer, before snapping.
 * @param sprintLengthDays - The plan's sprint length, for the chip's second half.
 * @returns The span, the length, and the two strings the chip is built from.
 */
export function sizeAim(
  sized: Sized,
  side: DrawnSide,
  day: number,
  sprintLengthDays: number,
): SizeAim {
  const reach = Math.max(snap(day), 0)
  const fromDay = side === 'end' ? sized.startDay : Math.min(reach, sized.endDay - DRAWN_GRAIN)
  const toDay = side === 'end' ? Math.max(reach, sized.startDay + DRAWN_GRAIN) : sized.endDay
  const days = toDay - fromDay
  return {
    chip: sized.brokenDown ? `${BROKEN_DOWN} ${MIDDOT} ${quoted(sized.name)}` : `Resize ${quoted(sized.name)}`,
    days,
    fromDay,
    lane: sized.lane,
    meta: `${String(days)}d ${MIDDOT} ${sprintWords(fromDay, toDay, sprintLengthDays)}`,
    refused: sized.brokenDown,
    toDay,
  }
}

/** What a release writes: the mark, and how long it now is. `null` where the drag was refused. */
export interface SizeDraft {
  readonly kind: 'feature' | 'item'

  readonly subjectId: string

  readonly days: number
}

/**
 * What a release writes, or `null` for a drag that may write nothing.
 *
 * A resize back to the length the mark already had writes nothing either, which is the no-op the drags
 * on this board all share: a gesture whose result a reader could not have seen is not a write.
 */
export const sizeDraft = (sized: Sized, aim: SizeAim): SizeDraft | null =>
  aim.refused || aim.days === sized.endDay - sized.startDay
    ? null
    : { days: aim.days, kind: sized.kind, subjectId: sized.subjectId }

/**
 * The same aim, taken straight off the mark the pointer is on.
 *
 * The one entry point `./use-extend.ts` calls, so that turning a hovered mark into a {@link Sized} is
 * written once here rather than in the hook that happens to hold the drag's state. Everything it copies
 * is a field `./extend-dom.ts` already read off the element.
 *
 * @param from - The mark under the pointer when the drag began.
 * @param side - Which handle was grabbed.
 * @param day - The day under the pointer now.
 * @param sprintLengthDays - The plan's sprint length, for the chip.
 * @returns What the resize would do.
 */
export const sizeOfMark = (
  from: Hovered,
  side: DrawnSide,
  day: number,
  sprintLengthDays: number,
): SizeAim => sizeAim(sizedOf(from), side, day, sprintLengthDays)

const sizedOf = (from: Hovered): Sized => ({
  brokenDown: from.brokenDown,
  endDay: from.endDay,
  kind: from.kind,
  lane: from.lane,
  name: from.name,
  startDay: from.startDay,
  subjectId: from.subjectId,
})

/** What a release on a sizing handle writes, or `null` where it would write nothing. */
export const sizeDraftOfMark = (
  from: Hovered,
  side: DrawnSide,
  day: number,
  sprintLengthDays: number,
): SizeDraft | null => sizeDraft(sizedOf(from), sizeOfMark(from, side, day, sprintLengthDays))
