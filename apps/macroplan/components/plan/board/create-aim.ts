import { xToDay, type PlanScale } from '@repo/canvas'
import type { PlanCalendar } from '@repo/schedule'
import type { Draft } from '../canvas/extend-view'
import { railsFrom } from '../canvas/selection'
import { laneAt, type CanvasPoint } from './create-drop'
import { CREATE_NAMES, type DragKind } from './create-kinds'
import { featureAim, gapAim, itemAim, refusedOn, type Landing } from './create-work'

/** What a drop is measured against: the scale it is drawn at and the calendar its days belong to. */
export interface DropAxis {
  /** What a day is worth in px. */
  readonly scale: PlanScale

  /** The plan's calendar, for the sprint a drop pins to and the date its chip says. */
  readonly calendar: PlanCalendar

  /**
   * The rail being dragged, or '' for every other kind of drag.
   *
   * It rides here because a rail's own id is the one thing about a drag that the **types** cannot carry:
   * `dataTransfer` hands over its data only on the drop, and a type is lowercased, which a ULID is not
   * (`./create-kinds.ts`). The root remembers it from the dragstart it saw bubble past.
   */
  readonly railId: string
}

/** What a release will do, which is the only thing `./create-write.ts` is handed. */
export type AimTarget =
  | { readonly kind: 'epic'; readonly gap: number }
  | { readonly kind: 'rail'; readonly epicId: string; readonly gap: number }
  | { readonly kind: 'work'; readonly draft: Draft }
  | { readonly kind: 'none' }

/** The preview: a line between rails, a box on a lane, or a tick between two items. */
export type AimMark =
  | { readonly shape: 'line'; readonly y: number }
  | { readonly shape: 'box'; readonly x: number; readonly y: number; readonly width: number }
  | { readonly shape: 'tick'; readonly x: number; readonly y: number }

/** Everything a drag over the board shows and would do. */
export interface Aim {
  /** What is being dragged. */
  readonly kind: DragKind

  /** The sentence over the preview. */
  readonly chip: string

  /** The preview itself. */
  readonly mark: AimMark

  /** Whether this drop would do nothing, which is drawn in red rather than hidden. */
  readonly refused: boolean

  /** What a release writes. */
  readonly target: AimTarget
}

const ON_A_RAIL = 'Drop on a rail'

/**
 * What a drag over the board is pointing at, and what it would do if it were released now.
 *
 * ### One function, four gestures
 *
 * A rail and a new epic both land in the **gap** between two rails, so both answer a line and a chip. A
 * feature lands on a lane, at a sprint or after the feature it was dropped past. An item lands between two
 * of a feature's items. The preview and the write come out of the same pass, which is what keeps them from
 * disagreeing — a chip that says "after Auth rewrite" over a drop that lands somewhere else is the failure
 * this shape makes unreachable.
 *
 * ### Why a feature near an end follows it
 *
 * Dropping a feature a day past the end of another one is how a reader says "and then this". The window is
 * measured in **days** rather than pixels, so it means the same thing at every zoom, and what it writes is
 * the dependency as well as the position: the two features are then ordered by the schedule rather than by
 * where the bar happened to land (`./create-drop.ts`).
 *
 * ### Why a refused drop is drawn
 *
 * An item dropped outside every feature draws a red box and the reason, rather than nothing: a drag that
 * stops previewing reads as a board that has stopped responding.
 *
 * @param kind - What is being dragged.
 * @param point - Where the pointer is, in canvas coordinates.
 * @param canvas - The SVG, which the rails and the marks are read from.
 * @param axis - The scale and the calendar.
 * @returns The preview and the write, together.
 */
export function aimedAt(kind: DragKind, point: CanvasPoint, canvas: Element, axis: DropAxis): Aim {
  const rails = railsFrom(canvas)
  const gap = { kind, point, railId: axis.railId, rails: rails.length }
  if (kind === 'epic') return gapAim({ ...gap, chip: `${CREATE_NAMES.epic} goes here` })
  if (kind === 'rail') return gapAim({ ...gap, chip: 'Move this rail here' })
  const lane = laneAt(point.y, rails.length)
  const rail = lane === null ? undefined : rails[lane]
  if (lane === null || rail === undefined) return refusedOn(kind, point, ON_A_RAIL)
  const on: Landing = {
    axis,
    canvas,
    day: xToDay(point.x, axis.scale),
    epicId: rail.epicId,
    lane,
    point,
  }
  return kind === 'feature' ? featureAim(on) : itemAim(on)
}
