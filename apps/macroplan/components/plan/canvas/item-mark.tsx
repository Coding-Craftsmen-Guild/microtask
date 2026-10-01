import type { ItemMark, Treatment } from '@repo/canvas'
import { hueStyle, TREATMENT_CLASS } from './treatments'
import { insideRail, LAYOUT } from './view'

const GAP = 0.75

const MARK_OPACITY = 0.55

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
   * mark and a bar label carry their **feature's** id here and not their own, so pointing at any part of
   * a feature lights all of it.
   */
  readonly hoverId: string
}

/**
 * One item as a tick under its feature's bar.
 *
 * Lighter than the bar above it, so the row reads as a bar with a breakdown beneath rather than as a
 * bar with a shadow. At full strength and the same hue the strip was the most common thing on the
 * canvas to be mistaken for a rendering artefact.
 *
 * A zero-width mark is still drawn, as a hairline: an item estimated at zero days is a real item
 * somebody entered, and dropping it would make a feature's breakdown silently disagree with its
 * drawer.
 *
 * ### Why each tick is pulled in from its own span
 *
 * `endDay` is exclusive and a mark's `x` comes from its `startDay`, so two consecutive items share a
 * boundary exactly: drawn at their true widths in one colour they abut, and a feature's four items
 * render as one unbroken strip. A fraction of a pixel of air at each end is what makes four ticks
 * read as four.
 */
export function ItemMarkShape(props: ItemMarkShapeProps) {
  const { mark, colour, treatment, top, labelId, detail, hoverId } = props
  return (
    <rect
      className={TREATMENT_CLASS[treatment]}
      data-detail={detail ?? undefined}
      data-hover-id={hoverId}
      data-item-id={mark.id}
      data-label-id={labelId ?? undefined}
      data-slot="item-mark"
      data-treatment={treatment}
      height={LAYOUT.markHeight}
      opacity={MARK_OPACITY}
      rx={1}
      style={hueStyle(treatment, colour)}
      width={Math.max(mark.width - GAP * 2, 0.5)}
      x={mark.x + GAP}
      y={insideRail(top, 'mark')}
    />
  )
}
