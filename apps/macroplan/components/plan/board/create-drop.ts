import type { FeatureBar, RailBox } from '@repo/canvas'
import { LAYOUT } from '../canvas/view'

/** Where a pointer is over the canvas, in the canvas's own pixels: its left edge is x zero. */
export interface CanvasPoint {
  readonly x: number

  readonly y: number
}

/**
 * Which lane a y falls in, or `null` for a y past the last one.
 *
 * `Math.floor` and not a round, because a lane is a band and a point is in exactly one of them. The
 * canvas's own chrome height is zero — the dates are an HTML row above it — so lane zero starts at
 * the canvas's own top and the division needs no offset.
 *
 * Past the last lane is `null` and not the last lane. A drop below the plan is a drop on the page,
 * and answering it with the bottom rail would put work on a rail nobody pointed at.
 */
export const laneAt = (y: number, rails: number): number | null => {
  const lane = Math.floor(y / LAYOUT.railHeight)
  return lane >= 0 && lane < rails ? lane : null
}

/**
 * Where a new rail goes for a y: the gap it is nearest, counted from zero.
 *
 * A **round** where {@link laneAt} floors, and that difference is the whole of what a rail drop is:
 * a feature lands *on* a lane and an epic lands *between* two, so one asks which band a point is
 * inside and the other which boundary it is nearest. Dropping halfway down rail two therefore
 * inserts above or below it depending on which half, which is what the 3px line drawn at that
 * boundary is saying.
 *
 * Clamped to the ends, so a drop above the first rail inserts at the top and one below the last
 * appends — both of which are real answers, where a lane past the end is not.
 */
export const gapAt = (y: number, rails: number): number =>
  Math.min(Math.max(Math.round(y / LAYOUT.railHeight), 0), rails)

/** The y a gap's insertion line is drawn at, which is the boundary it names. */
export const gapY = (gap: number): number => gap * LAYOUT.railHeight

/** The y a lane's own band opens at. */
export const laneY = (lane: number): number => lane * LAYOUT.railHeight

/**
 * The feature under a point on one rail, or `null` where the point is on bare lane.
 *
 * Half-open on the right — `startDay` inclusive, `endDay` exclusive — which is the convention every
 * `…Day` in `@repo/canvas` keeps and the reason consecutive features on a rail abut exactly rather
 * than overlapping on one day. A point on the boundary between two features is therefore in the
 * second, consistently, rather than in whichever the search happened to reach first.
 *
 * It reads the **drawn** bars and not the rail's `featureIds`: a feature with no estimate has no bar,
 * occupies no days, and cannot be the thing a pointer is over.
 */
export const featureAt = (rail: RailBox, day: number): FeatureBar | null =>
  rail.bars.find((bar) => day >= bar.startDay && day < bar.endDay) ?? null

/**
 * Which sprint a working day falls in, floored at zero.
 *
 * Floored because a drop can land left of day zero — the canvas is bled and the axis origin is the
 * plan's own first working day — and a negative pin is not a sprint. It is the same arithmetic
 * `sprintOf` does in `@repo/schedule`, written here over a day the drop already holds rather than
 * reached for through a calendar: this is the one number a drop needs and it needs no zone to get it.
 *
 * @param day - The working day the drop landed on.
 * @param sprintLengthDays - The plan's own sprint length.
 * @returns The sprint index to pin to, counted from zero as the API counts them.
 */
export const sprintAt = (day: number, sprintLengthDays: number): number =>
  Math.max(Math.floor(day / sprintLengthDays), 0)
