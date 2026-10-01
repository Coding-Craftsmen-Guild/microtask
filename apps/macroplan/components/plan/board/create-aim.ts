import { dayToX, widthOfDays, xToDay } from '@repo/canvas'
import type { PlanScale } from '@repo/canvas'
import { LAYOUT } from '../canvas/view'
import { railsFrom } from '../canvas/selection'
import { featureAt, gapAt, gapY, laneAt, laneY, sprintAt, type CanvasPoint } from './create-drop'
import { CREATE_NAMES, DROPPED_ESTIMATE, type CreateKind } from './create-kinds'

/** The two numbers a drop is read against: how wide a day is, and how long a sprint is. */
export interface DropAxis {
  readonly scale: PlanScale

  readonly sprintLengthDays: number
}

/** What a drop would make, once the pointer has told it where. */
export type AimTarget =
  | { readonly kind: 'epic'; readonly gap: number }
  | { readonly kind: 'feature'; readonly epicId: string; readonly sprint: number }
  | { readonly kind: 'item'; readonly featureId: string }
  | { readonly kind: 'none' }

/** The mark drawn where a drop would land: a line between lanes, or a box on one. */
export type AimMark =
  | { readonly shape: 'line'; readonly y: number }
  | { readonly shape: 'box'; readonly x: number; readonly y: number; readonly width: number }

/** Everything the board draws and does for one pointer position during a drag. */
export interface Aim {
  readonly kind: CreateKind

  /** What the chip over the mark says, which is where the drop lands in words. */
  readonly chip: string

  readonly mark: AimMark

  /**
   * Whether this position has nowhere to drop.
   *
   * A refused aim still draws — in red, and with a chip saying what is wrong — rather than drawing
   * nothing. A preview that disappears when the pointer is in the wrong place is indistinguishable
   * from a board that has stopped listening, and the one thing a reader needs at that moment is to be
   * told which of the two it is.
   */
  readonly refused: boolean

  readonly target: AimTarget
}

const boxAt = (x: number, lane: number, width: number): AimMark => ({
  shape: 'box',
  x,
  y: laneY(lane) + LAYOUT.barTop,
  width,
})

const epicAim = (point: CanvasPoint, rails: number): Aim => {
  const gap = gapAt(point.y, rails)
  return {
    kind: 'epic',
    chip: `${CREATE_NAMES.epic} goes here`,
    mark: { shape: 'line', y: gapY(gap) },
    refused: false,
    target: { kind: 'epic', gap },
  }
}

const NOWHERE: AimTarget = { kind: 'none' }

const refusedOn = (kind: CreateKind, point: CanvasPoint, chip: string): Aim => ({
  kind,
  chip,
  mark: boxAt(point.x, Math.max(Math.floor(point.y / LAYOUT.railHeight), 0), LAYOUT.railHeight),
  refused: true,
  target: NOWHERE,
})

/**
 * Where a drop would land, and what to draw there.
 *
 * ### Why the rails are read back off the canvas
 *
 * `railsFrom` rebuilds the whole `RailBox[]` out of the SVG the server drew, which is what
 * `canvas/selection.ts` already does for the bar drag and for the reason it records: a client
 * component may be handed primitives, an unbound function or `null` and nothing else, so the layout
 * cannot cross as a prop and the plan it came from may not cross at all. It is also the better
 * answer rather than merely the permitted one — the drop is resolved against *what is on screen*.
 *
 * ### The three kinds ask three different questions
 *
 * An epic lands **between** lanes, so it asks which boundary the pointer is nearest. A feature lands
 * **on** one, so it asks which band the pointer is inside. An item lands **in a feature**, so it asks
 * that and then which bar on that lane holds the day. `./create-drop.ts` is each of those as a
 * function over numbers, which is where they can be checked.
 *
 * @param kind - Which pill is being dragged.
 * @param point - Where the pointer is, in the canvas's own pixels.
 * @param canvas - The server-rendered SVG, read for its rails.
 * @param axis - The scale the canvas was drawn at, and the plan's sprint length.
 * @returns What to draw and what to write, or a refusal that still draws.
 */
export function aimedAt(
  kind: CreateKind,
  point: CanvasPoint,
  canvas: Element,
  axis: DropAxis,
): Aim {
  const rails = railsFrom(canvas)
  if (kind === 'epic') return epicAim(point, rails.length)
  const lane = laneAt(point.y, rails.length)
  const rail = lane === null ? undefined : rails[lane]
  if (lane === null || rail === undefined) return refusedOn(kind, point, 'Drop on a rail')
  const day = xToDay(point.x, axis.scale)
  if (kind === 'feature') {
    const sprint = sprintAt(day, axis.sprintLengthDays)
    return {
      kind,
      chip: `${CREATE_NAMES.feature} · S${String(sprint + 1)}`,
      mark: boxAt(
        dayToX(sprint * axis.sprintLengthDays, axis.scale),
        lane,
        widthOfDays(DROPPED_ESTIMATE, axis.scale),
      ),
      refused: false,
      target: { kind, epicId: rail.epicId, sprint },
    }
  }
  const bar = featureAt(rail, day)
  if (bar === null) return refusedOn(kind, point, 'Drop inside a feature')
  return {
    kind,
    chip: `${CREATE_NAMES.item} at the end`,
    mark: boxAt(bar.x, lane, bar.width),
    refused: false,
    target: { kind, featureId: bar.id },
  }
}
