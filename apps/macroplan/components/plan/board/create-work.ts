import { dayToX, widthOfDays, type FeatureBar } from '@repo/canvas'
import { dayToDate } from '@repo/schedule'
import type { Draft } from '../canvas/extend-view'
import { railsFrom } from '../canvas/selection'
import { LAYOUT } from '../canvas/view'
import type { Aim, AimMark, AimTarget, DropAxis } from './create-aim'
import { featureLabelOf, featureNameOf, itemsOf, railNameOf } from './create-dom'
import {
  afterOn,
  featureAt,
  gapAt,
  gapY,
  insertAt,
  laneY,
  sprintAt,
  type CanvasPoint,
} from './create-drop'
import { AFTER_WITHIN, CREATE_NAMES, DROPPED_ESTIMATE, type DragKind } from './create-kinds'

const MIDDOT = String.fromCharCode(0xb7)

const quoted = (name: string): string =>
  `${String.fromCharCode(0x201c)}${name}${String.fromCharCode(0x201d)}`

/** The two-day box a dropped feature would fill, on the lane it was dropped on. */
export const boxAt = (x: number, lane: number, width: number): AimMark => ({
  shape: 'box',
  width,
  x,
  y: laneY(lane) + LAYOUT.barTop,
})

interface GapDrop {
  readonly kind: DragKind
  readonly point: CanvasPoint
  readonly rails: number
  readonly chip: string
  readonly railId: string
}

/**
 * A rail or a new epic: both land in the gap between two rails, and both draw the line there.
 *
 * @param drop - What is being dragged, where, over how many rails, and what the chip should say.
 * @returns The line, the chip and the write.
 */
export const gapAim = ({ kind, point, rails, chip, railId }: GapDrop): Aim => {
  const gap = gapAt(point.y, rails)
  return {
    chip,
    kind,
    mark: { shape: 'line', y: gapY(gap) },
    refused: false,
    target: kind === 'rail' ? { gap, epicId: railId, kind: 'rail' } : { gap, kind: 'epic' },
  }
}

const NOWHERE: AimTarget = { kind: 'none' }

/** A drop that would do nothing, drawn in red with its reason rather than not drawn at all. */
export const refusedOn = (kind: DragKind, point: CanvasPoint, chip: string): Aim => ({
  chip,
  kind,
  mark: boxAt(point.x, Math.max(Math.floor(point.y / LAYOUT.railHeight), 0), LAYOUT.railHeight),
  refused: true,
  target: NOWHERE,
})

const drafted = (draft: Draft): AimTarget => ({ draft, kind: 'work' })

/** Where a drop of work landed, which is everything the two aims below read. */
export interface Landing {
  /** The SVG, which the rails and the marks are read from. */
  readonly canvas: Element
  /** The pointer, in canvas coordinates. */
  readonly point: CanvasPoint

  /** Which lane it is over. */
  readonly lane: number
  /** That lane's rail. */
  readonly epicId: string

  /** The day under the pointer. */
  readonly day: number

  /** The scale and the calendar. */
  readonly axis: DropAxis
}

const startsAt = (on: Landing, after: FeatureBar | null): number =>
  after === null
    ? sprintAt(on.day, on.axis.calendar.sprintLengthDays) * on.axis.calendar.sprintLengthDays
    : after.endDay

/**
 * A dropped feature: after the feature it was dropped past, or starting in the sprint it landed in.
 *
 * @param on - Where the drop landed.
 * @returns The box, the chip and the write.
 */
export const featureAim = (on: Landing): Aim => {
  const rail = railsFrom(on.canvas)[on.lane]
  const after = rail === undefined ? null : afterOn(rail, on.day, AFTER_WITHIN)
  const day = startsAt(on, after)
  const follows = after === null ? null : { id: after.id, name: featureNameOf(on.canvas, after.id) }
  return {
    chip:
      follows === null
        ? `${railNameOf(on.canvas, on.epicId)} ${MIDDOT} ${dayToDate(day, on.axis.calendar)}`
        : `After ${quoted(follows.name)}`,
    kind: 'feature',
    mark: boxAt(dayToX(day, on.axis.scale), on.lane, widthOfDays(DROPPED_ESTIMATE, on.axis.scale)),
    refused: false,
    target: drafted({
      days: DROPPED_ESTIMATE,
      edge: follows === null ? 'none' : 'new-waits',
      epicId: on.epicId,
      featureId: follows?.id ?? '',
      kind: 'feature',
      labelId: follows === null ? '' : featureLabelOf(on.canvas, follows.id),
      position: (rail?.bars ?? []).filter((bar) => bar.startDay <= day).length,
      sprint: sprintAt(day, on.axis.calendar.sprintLengthDays),
    }),
  }
}

const INSIDE_A_FEATURE = 'Drop inside a feature'

/**
 * A dropped item: between the two items of the feature under the pointer that it was dropped between.
 *
 * @param on - Where the drop landed.
 * @returns The tick, the chip and the write; refused outside every feature.
 */
export const itemAim = (on: Landing): Aim => {
  const rail = railsFrom(on.canvas)[on.lane]
  const bar = rail === undefined ? null : featureAt(rail, on.day)
  if (bar === null) return refusedOn('item', on.point, INSIDE_A_FEATURE)
  const items = itemsOf(on.canvas, bar.id)
  const position = insertAt(on.point.x, items)
  const before = items[position - 1]
  return {
    chip: `${CREATE_NAMES.item} ${MIDDOT} ${quoted(featureNameOf(on.canvas, bar.id))} ${MIDDOT} position ${String(position + 1)}`,
    kind: 'item',
    mark: {
      shape: 'tick',
      x: before === undefined ? bar.x : before.x + before.width,
      y: laneY(on.lane) + LAYOUT.itemTop,
    },
    refused: false,
    target: drafted({
      days: DROPPED_ESTIMATE,
      edge: 'none',
      epicId: on.epicId,
      featureId: bar.id,
      kind: 'item',
      labelId: '',
      position,
      sprint: null,
    }),
  }
}

