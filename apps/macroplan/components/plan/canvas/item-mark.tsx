import type { ItemMark, Treatment } from '@repo/canvas'
import { hueStyle, TREATMENT_CLASS } from './treatments'
import { LAYOUT } from './view'

/** Props for {@link ItemMarkShape}. */
export interface ItemMarkShapeProps {
  /** The mark, already laid out: its days and its px, computed by `itemsToMarks`. */
  readonly mark: ItemMark

  /** Its rail's epic's own `#rrggbb`, or `null` for a rail no epic claims. */
  readonly colour: string | null

  /** How its schedule says to draw it. */
  readonly treatment: Treatment

  /** The y of its rail's own band. */
  readonly top: number
}

/**
 * One item as a thin strip under its feature's bar: §5's "items inside where they fit".
 *
 * **Exactly one element per item, and that is a requirement rather than tidiness.** Phase 2's gate is
 * that "the canvas renders at the 2 000-item cap", and a mark built from a group with a rect and a
 * label inside it would put six thousand nodes on the page for a plan at that cap. An item's own name
 * belongs to the table, which is the rendering a reader can actually read, and to the item rung's
 * labels, which §5 puts there and phase 2 does not draw.
 *
 * It takes its epic's colour from the rail it was drawn under, not from a lookup of its own: an item
 * has a `featureId` and no `epicId`, and the rail already knows which epic's hue it is painting.
 *
 * An item the forward pass never placed has no mark at all, the same way an unplaced feature has no
 * bar — `itemsToMarks` omits it, so `'hollow'` and `'contradicted'` reach a mark here only for an
 * item that *was* placed and whose feature's cycle is what is being said.
 */
export function ItemMarkShape({ mark, colour, treatment, top }: ItemMarkShapeProps) {
  return (
    <rect
      className={TREATMENT_CLASS[treatment]}
      data-item-id={mark.id}
      data-slot="item-mark"
      data-treatment={treatment}
      height={LAYOUT.markHeight}
      style={hueStyle(treatment, colour)}
      width={mark.width}
      x={mark.x}
      y={top + LAYOUT.markTop}
    />
  )
}
