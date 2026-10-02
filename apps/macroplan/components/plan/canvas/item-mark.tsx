import type { ItemMark, Treatment } from '@repo/canvas'
import { ITEM } from './line-css'
import { fitLabel } from './mark-label'
import { ITEM_GAP, LAYOUT } from './mark-metrics'
import { hueStyle, TREATMENT_CLASS } from './treatments'
import { insideRail } from './view'

const LABEL_PAD = 7

const RADIUS = 5

const BASELINE = 16

const inkOf = (colour: string | null): string | undefined =>
  colour === null ? undefined : `color-mix(in oklch, ${colour} 60%, black)`

/** Props for {@link ItemMarkShape}. */
export interface ItemMarkShapeProps {
  /** Where this item sits and how wide it is, from the schedule. */
  readonly mark: ItemMark

  /** The hue its feature is painted in. */
  readonly colour: string | null

  /** What the schedule made of it. */
  readonly treatment: Treatment

  /** The top of its rail. */
  readonly top: number

  /** Its feature's group, for the group dimming. */
  readonly labelId: string | null

  /** The hover card's text, or `null` where there is none. */
  readonly detail: string | null

  /** Which thread lights up with it, which is its feature. */
  readonly hoverId: string

  /** Its stored name. */
  readonly name: string

  /**
   * Where it sits among its feature's items, which a draw from its end counts "after it" from.
   *
   * An attribute rather than anything structural, because the budget this mark is drawn under is one
   * element per item at the two-thousand cap (`./plan-canvas.test.tsx`). Three attributes buy the draw
   * gesture everything it needs about an item; three more elements per item would not be affordable.
   */
  readonly position: number
}

/**
 * One item, as a bar under the line of the feature it belongs to.
 *
 * It stays one `<rect>` wherever its label does not fit, which is the element budget talking: at the
 * cap this canvas draws two thousand of them, and a wrapper per item would be two thousand nodes for
 * nothing. The `+` handles a reader draws new work from are **not** here for the same reason — they are
 * rendered once, over whichever mark the pointer is on (`./extend-overlay.tsx`).
 *
 * `data-start-day` and `data-end-day` are what a draw reads off it. They could be worked back out of the
 * `x` and `width` this element already carries, but not safely: the bar is inset by a gap, so at a coarse
 * zoom the arithmetic lands half a day out, and a gesture that creates work may not be approximately
 * right.
 */
export function ItemMarkShape(props: ItemMarkShapeProps) {
  const { mark, colour, treatment, top, labelId, detail, hoverId, name } = props
  const y = insideRail(top, 'item')
  const width = Math.max(mark.width - ITEM_GAP * 2, 0.5)
  const label = fitLabel(name, width, LABEL_PAD * 2)
  const bar = (
    <rect
      className={TREATMENT_CLASS[treatment]}
      data-detail={detail ?? undefined}
      data-end-day={mark.endDay}
      data-hover-id={hoverId}
      data-item-id={mark.id}
      data-label-id={labelId ?? undefined}
      data-position={props.position}
      data-slot="item-mark"
      data-start-day={mark.startDay}
      data-treatment={treatment}
      height={LAYOUT.itemHeight}
      rx={RADIUS}
      style={hueStyle(treatment, colour)}
      width={width}
      x={mark.x + ITEM_GAP}
      y={y}
    />
  )
  if (label === '') return bar
  return (
    <g>
      {bar}
      <text className={ITEM.label} fill={inkOf(colour)} x={mark.x + ITEM_GAP + LABEL_PAD} y={y + BASELINE}>
        {label}
      </text>
    </g>
  )
}
