import { dayToX, widthOfDays, type PlanScale } from '@repo/canvas'
import { DrawStripes } from './draw-stripes'
import { CHIP_LIFT, DRAW } from './extend-css'
import type { DrawAim } from './extend-view'
import { insideRail, LAYOUT, railTop } from './view'

const CHIP_HEIGHT = 20

/** Props for {@link ExtendGhost}. */
export interface ExtendGhostProps {
  /** What the pointer has drawn. */
  readonly aim: DrawAim

  /** Which end of the bar is the free one, which is where the guide goes. */
  readonly forward: boolean

  /** How big the canvas is, so the sheet over it is the same size. */
  readonly box: { readonly width: number; readonly height: number }

  /** What a day is worth in px. */
  readonly scale: PlanScale

  /** The end the draw started from, or `null` while it is still in that mark's own lane. */
  readonly from: { readonly x: number; readonly y: number } | null
}

/**
 * The bar a drag is drawing, before anything is created.
 *
 * ### Why it looks like nothing else on the board
 *
 * Dashed, striped and in the brand hue rather than the rail's: every other bar on this canvas is a fact
 * about the plan, and this one is a sentence somebody is still typing. There is no state of the schedule
 * it could be mistaken for, which is what makes it safe to draw it right where the real bar will go.
 *
 * ### The guide and the chip
 *
 * The guide is a full-height dashed line at the **free** edge — the one the pointer is moving — because
 * that is the edge a reader is choosing, and a day is only legible against the grid behind it. The chip
 * floats above the bar and says what will be made and how long it is, in two colours: the sentence in
 * white, the measurement in gold, which is the one piece of chrome on this board that is ever gold.
 *
 * It is a sheet over the canvas rather than nodes inside it, for `./drag-ghost.tsx`'s reason: the SVG is
 * server-rendered and must not re-render sixty times a second, so what moves is an overlay of three nodes.
 */
export function ExtendGhost({ aim, forward, box, scale, from }: ExtendGhostProps) {
  const x = dayToX(aim.fromDay, scale)
  const width = Math.max(widthOfDays(aim.days, scale), 2)
  const top = railTop(aim.lane)
  const y = insideRail(top, 'bar')
  const edge = forward ? x + width : x
  return (
    <>
      <svg
        aria-hidden="true"
        className={DRAW.sheet}
        data-slot="draw-ghost"
        focusable="false"
        height={box.height}
        style={{ minWidth: box.width }}
      >
        <DrawStripes />
        <line className={DRAW.guide} x1={edge} x2={edge} y1={0} y2={box.height} />
        {from === null ? null : (
          <line
            className={DRAW.link}
            x1={from.x}
            x2={forward ? x : x + width}
            y1={from.y}
            y2={y + LAYOUT.barHeight / 2}
          />
        )}
        <rect
          className={DRAW.bar}
          height={LAYOUT.barHeight}
          rx={5}
          width={width}
          x={x}
          y={y}
        />
      </svg>
      <span
        className={DRAW.chip}
        data-slot="draw-chip"
        style={{ left: x, top: Math.max(y - CHIP_LIFT, 0), height: CHIP_HEIGHT }}
      >
        {aim.chip}
        <span className={DRAW.meta}>{aim.meta}</span>
      </span>
    </>
  )
}
