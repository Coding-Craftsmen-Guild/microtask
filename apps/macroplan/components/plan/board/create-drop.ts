import type { FeatureBar, RailBox } from '@repo/canvas'
import { LAYOUT } from '../canvas/view'

/** A point on the canvas, in the canvas's own coordinates. */
export interface CanvasPoint {
  /** How far across, in px. */
  readonly x: number

  /** How far down, in px. */
  readonly y: number
}

/**
 * Which lane a point is in, or `null` for a point past the last rail.
 *
 * A **floor**, because a lane is a band and a point is inside exactly one of them. Past the last rail is
 * `null` rather than the last lane: a drop below the plan is a drop on the page, and answering it with the
 * bottom rail would put work on a rail nobody pointed at.
 *
 * @param y - How far down the canvas.
 * @param rails - How many there are.
 * @returns The lane, or `null`.
 */
export const laneAt = (y: number, rails: number): number | null => {
  const lane = Math.floor(y / LAYOUT.railHeight)
  return lane >= 0 && lane < rails ? lane : null
}

/**
 * Which gap between rails a point is nearest, which is where a rail lands.
 *
 * A **round** where {@link laneAt} floors, and that difference is the whole of what a rail drop is: a
 * feature lands on a lane and a rail lands between two. Clamped at both ends, so a drop above the first
 * inserts at the top and one below the last appends.
 *
 * @param y - How far down the canvas.
 * @param rails - How many there are.
 * @returns A gap index, from 0 to the number of rails.
 */
export const gapAt = (y: number, rails: number): number =>
  Math.min(Math.max(Math.round(y / LAYOUT.railHeight), 0), rails)

/** Where a gap's insertion line is drawn. */
export const gapY = (gap: number): number => gap * LAYOUT.railHeight

/** Where a lane's top edge is. */
export const laneY = (lane: number): number => lane * LAYOUT.railHeight

/**
 * Which feature a day falls inside, or `null` for a day in the space between them.
 *
 * Half-open on the right, so a point on a boundary is in the feature that opens there rather than in the
 * one that closes.
 *
 * @param rail - The rail being dropped on.
 * @param day - The day under the pointer.
 * @returns The bar, or `null`.
 */
export const featureAt = (rail: RailBox, day: number): FeatureBar | null =>
  rail.bars.find((bar) => day >= bar.startDay && day < bar.endDay) ?? null

/**
 * The feature a drop is near the **end** of, which is what makes a dropped feature follow another.
 *
 * "Near" is a window in days rather than in pixels, so the gesture means the same thing at every zoom: a
 * drop a day and a half past the end of a feature is a drop that said *after this one*, whether that is
 * six pixels or sixty. Only the end counts — a drop near a feature's start is a drop in the middle of
 * whatever comes before it, and that is already an ordinary drop.
 *
 * @param rail - The rail being dropped on.
 * @param day - The day under the pointer.
 * @param within - How many days past an end still counts as after it.
 * @returns The bar to follow, or `null`.
 */
export const afterOn = (rail: RailBox, day: number, within: number): FeatureBar | null =>
  rail.bars.find((bar) => day >= bar.endDay && day < bar.endDay + within) ?? null

/** Which sprint a day is in, counted from zero and never negative. */
export const sprintAt = (day: number, sprintLengthDays: number): number =>
  Math.max(Math.floor(day / sprintLengthDays), 0)

/** One item of a feature as the board drew it, which is all a drop needs to order itself among them. */
export interface ItemSlot {
  /** The item. */
  readonly id: string

  /** Its left edge, in canvas coordinates. */
  readonly x: number

  /** Its width. */
  readonly width: number
}

/**
 * Where among a feature's items a drop lands: before the first one whose middle is right of the pointer.
 *
 * Middles rather than edges, because the question a reader is answering is "which gap", and the nearest
 * gap to a pointer inside a bar is the one the pointer is in the half nearer to. A drop past every item
 * appends, which is what an empty feature answers too.
 *
 * @param x - The pointer, in canvas coordinates.
 * @param items - The feature's items, in the order the board drew them.
 * @returns A position among them.
 */
export const insertAt = (x: number, items: readonly ItemSlot[]): number =>
  items.filter((item) => item.x + item.width / 2 <= x).length
