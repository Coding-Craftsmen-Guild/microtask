import type { ItemHeld } from './item-drag'
import { LAYOUT } from './view'

const OVERLAY = 'pointer-events-none absolute top-0 left-0 block w-full'

const GHOST = 'fill-none stroke-foreground stroke-2 [stroke-dasharray:4_3]'

const REFUSED = 'fill-none stroke-destructive stroke-2 [stroke-dasharray:4_3]'

const GHOST_RADIUS = 3

/** Props for {@link ItemGhost}. */
export interface ItemGhostProps {
  /** The item being dragged, with how far the pointer has taken it. */
  readonly held: ItemHeld

  /** Whether letting go here would write nothing, which is drawn as a refusal. */
  readonly refused: boolean

  /** How big the canvas is, so the overlay covers it exactly. */
  readonly box: { readonly width: number; readonly height: number }
}

/**
 * The outline of an item that is being dragged, following the pointer.
 *
 * The same device `./drag-ghost.tsx` draws for a feature and deliberately the same paint: a reader
 * dragging either should not have to learn two outlines. It is a second component rather than a prop on
 * that one because the two drags hold different things — a feature's ghost is placed from a rail's top
 * and a bar's width, an item's from the rect it was drawn as (`./item-drag.ts`) — and a single component
 * taking a union would be two bodies behind one name.
 *
 * It draws **where the pointer has taken the item**, not where it would land. That is the honest half: a
 * drop lands at a *slot* among another feature's items, and sliding the outline into that slot would
 * animate a rearrangement the server has not agreed to yet. The refused paint is what says the slot does
 * not exist — a release over the gap between two features, or past the last rail, writes nothing.
 *
 * `aria-hidden`, for the reason the feature's ghost is: it is pointer feedback, and the keyboard path to
 * the same move is the drawer's own ordering controls.
 */
export function ItemGhost({ held, refused, box }: ItemGhostProps) {
  return (
    <svg
      aria-hidden="true"
      className={OVERLAY}
      data-slot="item-ghost"
      focusable="false"
      height={box.height}
      style={{ minWidth: box.width }}
    >
      <rect
        className={refused ? REFUSED : GHOST}
        data-refused={refused}
        height={LAYOUT.itemHeight}
        rx={GHOST_RADIUS}
        width={held.width}
        x={held.x + held.travelled.x}
        y={held.y + held.travelled.y}
      />
    </svg>
  )
}
