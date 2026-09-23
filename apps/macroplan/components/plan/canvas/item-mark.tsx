import type { ItemMark, Treatment } from '@repo/canvas'
import { hueStyle, TREATMENT_CLASS } from './treatments'
import { insideRail, LAYOUT } from './view'

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
 * That count is also why a mark carries **no `<title>` and so no hover date of its own**, and why
 * the sprint's hover target behind it does not cover for one: a painted fill absorbs the pointer,
 * and an SVG tooltip walks the hit element's ancestors rather than the paint order.
 * `FeatureBarMark` sets out that whole trade — including why the target is deliberately not moved
 * above the rails before phase 3 makes marks interactive.
 *
 * It takes its epic's colour from the rail it was drawn under, not from a lookup of its own: an item
 * has a `featureId` and no `epicId`, and the rail already knows which epic's hue it is painting.
 *
 * **The treatment is always `'solid'` here, and the prop is still right.** The forward pass puts an
 * item in `spans` or in `unscheduled` and never both — `writeFeature` pushes an entry for an unplaced
 * feature *and each of its items*, and `writeItems` pushes one for each estimateless item of a placed
 * feature — and `itemsToMarks` produces a mark only for an id it finds in `spans`. So no mark can
 * carry `'hollow'` or `'contradicted'`, and `UnplacedFeatures` is the one place either is ever seen.
 * The prop stays because `Rail` reads one treatment map for bars and marks alike, because a total
 * component cannot be handed a state it does not draw, and because phase 4 widens the union with
 * states a *placed* item will have.
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
      y={insideRail(top, 'mark')}
    />
  )
}
