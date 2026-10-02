import type { PointerEvent } from 'react'
import { EXTEND } from './extend-css'
import { ExtendHandle } from './extend-handle'
import type { DrawnSide } from './extend-view'
import type { Hovered } from './extend-dom'

/** Props for {@link ExtendOverlay}. */
export interface ExtendOverlayProps {
  /** The mark the pointer is on, or `null` for a pointer on none. */
  readonly hovered: Hovered | null

  /** How big the sheet over the canvas should be. */
  readonly box: { readonly width: number; readonly height: number }

  /** Whether Ctrl is held, which swaps both handles for the ones that resize the mark. */
  readonly sizing: boolean

  /** Start a draw from one end of that mark. */
  readonly onBegin: (side: DrawnSide, event: PointerEvent<SVGGElement>) => void
}

/**
 * Both ends of the mark under the pointer, each a handle.
 *
 * The end handle draws the work that comes **after** this one: the new thing waits on it. The start handle
 * draws what comes before, and the dependency runs the other way. Both are drawn or neither is, because a
 * mark you can only build forwards from is a mark whose other end a reader will try anyway.
 *
 * One sheet over the whole canvas rather than two nodes inside it, which is what keeps the SVG a Server
 * Component: the handles move by re-rendering this overlay as the pointer crosses marks, and the two
 * thousand marks under it never re-render at all.
 */
export function ExtendOverlay({ hovered, box, sizing, onBegin }: ExtendOverlayProps) {
  if (hovered === null) return null
  const shared = {
    colour: hovered.colour,
    diamond: hovered.diamond,
    onBegin,
    refused: sizing && hovered.brokenDown,
    sizing,
    y: hovered.y,
  }
  return (
    <svg
      className={EXTEND.sheet}
      data-slot="extend-overlay"
      focusable="false"
      height={box.height}
      style={{ minWidth: box.width }}
    >
      <ExtendHandle {...shared} side="start" x={hovered.x} />
      <ExtendHandle {...shared} side="end" x={hovered.x + hovered.width} />
    </svg>
  )
}
