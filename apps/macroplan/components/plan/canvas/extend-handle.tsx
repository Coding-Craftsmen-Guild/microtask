import type { PointerEvent } from 'react'
import { EXTEND, HANDLE } from './extend-css'
import type { DrawnSide } from './extend-view'

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

  /** Start a draw from this end. */
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
export function ExtendHandle({ x, y, side, colour, diamond, onBegin }: ExtendHandleProps) {
  const r = diamond ? HANDLE.diamond : HANDLE.circle
  return (
    <g
      className={EXTEND.handle}
      data-side={side}
      data-slot="extend-handle"
      onPointerDown={(event) => onBegin(side, event)}
      style={{ '--mark-hue': colour } as React.CSSProperties}
    >
      {diamond ? (
        <polygon className={EXTEND.shape} points={diamondAt(x, y, r)} />
      ) : (
        <circle className={EXTEND.shape} cx={x} cy={y} r={r} />
      )}
      <line className={EXTEND.plus} x1={x - HANDLE.plus} x2={x + HANDLE.plus} y1={y} y2={y} />
      <line className={EXTEND.plus} x1={x} x2={x} y1={y - HANDLE.plus} y2={y + HANDLE.plus} />
    </g>
  )
}
