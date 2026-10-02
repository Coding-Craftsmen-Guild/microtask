import type { PointerEvent } from 'react'
import { ARROW, EXTEND, HANDLE } from './extend-css'
import type { DrawnSide } from './extend-view'

const chevronAt = (x: number, y: number, way: 1 | -1): string =>
  [
    `M ${String(x + ARROW.reach * way - ARROW.barb * way)} ${String(y - ARROW.barb)}`,
    `L ${String(x + ARROW.reach * way)} ${String(y)}`,
    `L ${String(x + ARROW.reach * way - ARROW.barb * way)} ${String(y + ARROW.barb)}`,
  ].join(' ')

const diamondAt = (x: number, y: number, r: number): string =>
  [
    `${String(x)},${String(y - r)}`,
    `${String(x + r)},${String(y)}`,
    `${String(x)},${String(y + r)}`,
    `${String(x - r)},${String(y)}`,
  ].join(' ')

/** Props for {@link ExtendHandle}. */
export interface ExtendHandleProps {
  /** Where it sits, in canvas coordinates: the mark's own edge. */
  readonly x: number

  /** The middle of the mark, vertically. */
  readonly y: number

  /** Which end of the mark this is, which decides which way a draw goes and which way the edge runs. */
  readonly side: DrawnSide

  /** The hue to paint it, which is the hue its mark is painted in. */
  readonly colour: string

  /** The diamond rendering, which is what a feature **line** uses instead of a circle. */
  readonly diamond: boolean

  /**
   * Whether this handle resizes the mark rather than drawing new work beside it.
   *
   * Which one a reader gets is the **Ctrl key** (`./use-extend.ts`): the board's one modifier, held while
   * the pointer is over a mark. Two gestures start from the same two points and cannot both have them, so
   * the one a reader reaches for by default is the one that makes something — and the one that changes
   * what is already there asks for the key.
   */
  readonly sizing: boolean

  /** Whether a drag from it would write nothing, which is painted as a dead handle. */
  readonly refused: boolean

  /** Start a draw, or a resize, from this end. */
  readonly onBegin: (side: DrawnSide, event: PointerEvent<SVGGElement>) => void
}

/**
 * The `+` on one end of a mark: grab it and draw the work that comes next.
 *
 * ### Two shapes, because the rungs draw two shapes
 *
 * A bar gets a 14px circle centred on its edge, half overlapping it, so there is no gap between the bar
 * and the handle for a pointer to fall through. A feature **line** has no bar to overlap: its own
 * diamonds already sit at those two points, so the handle takes their place — the shape that was already
 * there, 12px instead of 9, with a plus inside it.
 *
 * ### Why there are only ever two of these
 *
 * They are rendered over whichever mark the pointer is on rather than with every mark, and that is the
 * element budget talking: this canvas draws two thousand items at the cap under a budget of one element
 * each (`./plan-canvas.test.tsx`), and a pair of handles per mark would be four thousand nodes for the
 * two a reader can reach. `./extend-overlay.tsx` holds the pair; `./extend-dom.ts` reads the mark under
 * the pointer.
 */
export function ExtendHandle(props: ExtendHandleProps) {
  const { x, y, side, colour, diamond, sizing, refused, onBegin } = props
  const r = diamond ? HANDLE.diamond : HANDLE.circle
  const shape = refused ? EXTEND.shut : EXTEND.shape
  return (
    <g
      className={sizing ? EXTEND.sizing : EXTEND.handle}
      data-refused={refused}
      data-side={side}
      data-slot="extend-handle"
      data-sizing={sizing}
      onPointerDown={(event) => onBegin(side, event)}
      style={{ '--mark-hue': colour } as React.CSSProperties}
    >
      {diamond ? (
        <polygon className={shape} points={diamondAt(x, y, r)} />
      ) : (
        <circle className={shape} cx={x} cy={y} r={r} />
      )}
      {sizing ? (
        <>
          <line className={EXTEND.arrow} x1={x - ARROW.reach} x2={x + ARROW.reach} y1={y} y2={y} />
          <path className={EXTEND.arrow} d={chevronAt(x, y, 1)} />
          <path className={EXTEND.arrow} d={chevronAt(x, y, -1)} />
        </>
      ) : (
        <>
          <line className={EXTEND.plus} x1={x - HANDLE.plus} x2={x + HANDLE.plus} y1={y} y2={y} />
          <line className={EXTEND.plus} x1={x} x2={x} y1={y - HANDLE.plus} y2={y + HANDLE.plus} />
        </>
      )}
    </g>
  )
}
