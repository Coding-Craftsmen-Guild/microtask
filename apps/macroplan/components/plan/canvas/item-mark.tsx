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
  readonly mark: ItemMark

  readonly colour: string | null

  readonly treatment: Treatment

  readonly top: number

  readonly labelId: string | null

  /**
   * What a hover over this mark says, joined, or `null` where nothing worded it.
   *
   * A string and not a record, because it lands as one attribute and is read back out of the markup
   * by the one client root that draws the card — `detail-lines.ts` carries both halves of that.
   */
  readonly detail: string | null

  /**
   * The id of the feature whose thread this mark belongs to, which is what a hover lights.
   *
   * The same value as `data-feature-id` on a bar and deliberately a second attribute, because the two
   * are read by different things and mean different things: `data-feature-id` is geometry the drag and
   * the selection sheet answer against, and this is "light me when that feature is pointed at". An item
   * mark carries its **feature's** id here and not its own, so pointing at any part of a feature
   * lights all of it.
   */
  readonly hoverId: string

  /** The item's own name, cut to the bar's width or dropped where it will not fit. */
  readonly name: string
}

/**
 * One item as a bar under its feature's line, carrying its own name.
 *
 * ### What this was, and why a tick was not enough
 *
 * A 4px strip under the feature's bar — four items as four hairlines, at 55% opacity, with no name
 * on any of them. It was the whole of what the canvas said about a breakdown, and it was most often
 * mistaken for a rendering artefact. The design's answer is the one the numbers allow: at the Sprint
 * stop a day is 40px, so a two-day item is 80px, which is a bar wide enough to hold a dozen
 * characters. `./mark-label.ts` carries why the canvas writes text again and what stops that
 * degrading at a narrower mark.
 *
 * A zero-width item is still drawn, as a hairline: an item estimated at zero days is a real item
 * somebody entered, and dropping it would make a feature's breakdown silently disagree with its
 * drawer.
 *
 * ### Why each bar is pulled in from its own span
 *
 * `endDay` is exclusive and a mark's `x` comes from its `startDay`, so two consecutive items share a
 * boundary exactly: drawn at their true widths they abut, and a feature's four items render as one
 * long block. {@link ITEM_GAP} at each end is what makes four bars read as four.
 *
 * ### Why a bar with no label is not wrapped
 *
 * A `<g>` around one `<rect>` is an element per item on a canvas capped at two thousand of them, for
 * nothing. A bar too narrow for its own name is therefore the bare rect it always was, and the group
 * exists only where there is a second child to hold. `./mark-label.ts` carries where that line falls.
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
      data-hover-id={hoverId}
      data-item-id={mark.id}
      data-label-id={labelId ?? undefined}
      data-slot="item-mark"
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
