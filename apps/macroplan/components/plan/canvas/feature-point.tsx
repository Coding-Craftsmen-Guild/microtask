import type { FeatureBar, Treatment } from '@repo/canvas'
import { diamondPoints, isMilestone } from '@repo/canvas'
import { fitLabel } from './mark-label'
import { POINT } from './line-css'
import { NODE_CLASS, nodeStyle } from './treatments'
import { LAYOUT, NODE_RADIUS, pointX } from './mark-metrics'
import { insideRail } from './view'

const LABEL_GAP = 7

const BASELINE = 4

const inkOf = (colour: string | null): string | undefined =>
  colour === null ? undefined : `color-mix(in oklch, ${colour} 60%, black)`

/** Props for {@link FeaturePointMark}. */
export interface FeaturePointMarkProps {
  readonly bar: FeatureBar

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
   * The same value as `data-feature-id` and deliberately a second attribute, because the two are read
   * by different things and mean different things: `data-feature-id` is geometry the drag and the
   * selection sheet answer against, and this is "light me when that feature is pointed at".
   */
  readonly hoverId: string

  /** The feature's own name, written beside the point or dropped where it will not fit. */
  readonly name: string

  /**
   * How much room this point's name has before the next mark on the rail, in px.
   *
   * The budget is the **gap to the neighbour** and not the mark's own width, which is the one way a
   * point differs from a bar as something to write on: a point is nine pixels wide at every zoom, so
   * a budget taken from the mark would drop every label at every stop. What varies with the zoom is
   * the air around it, and that is what a name is written into.
   *
   * `RailFeatures` measures it, because it is the only thing holding a rail's marks in order.
   */
  readonly room: number
}

/**
 * One feature as a point at the middle of its span — the Quarter and Year stops' mark.
 *
 * The Sprint stop draws a **line** with its items as bars beneath (`./feature-line.tsx`). These two
 * stops draw no items, and `./rung-view.ts` carries why they draw no bar either: a row of back-to-back
 * bars at four pixels a day is one block of hue with no pieces in it, where a row of points is a row
 * of marks with the gaps between them drawn to scale.
 *
 * ### The geometry stays the span's, and that is load-bearing
 *
 * `data-x` and `data-width` carry the **bar's** true left edge and width, not the point's, because
 * that is what `selection.ts` reads to answer where a drag started and where it landed, and what
 * `extend-dom.ts` reads to put a `+` handle at each end of the feature. A point that reported itself
 * as nine pixels wide would make a drag at these stops land nine pixels from wherever it was aimed and
 * would collapse both draw handles onto one spot.
 *
 * So the drawn mark and the reported geometry are deliberately different things, in the same way a
 * bar's 1px inset was: what is drawn is the stop's reading of the span, and what is reported is the
 * span.
 *
 * ### Why the middle and not the start
 *
 * An arc leaves one mark and arrives at another, and `arc-view.ts` anchors it on the two ends of the
 * drawn mark. Anchored on a span whose edges nothing draws, every dependency between two features that
 * touch — the common case along one rail — came out as a curve from a point to that same point: a
 * 36px loop hidden behind the marks at either end of it.
 *
 * Two points have two different middles whenever the features have different spans, so anchoring there
 * is what makes those arcs real curves. It is also the honest x for a mark that claims one: the middle
 * of the work is the one day inside a span that is not an edge of it.
 *
 * A milestone takes no time, so its middle *is* its edge; it keeps the diamond, which is the shape
 * that tells a zero-day mark from a point.
 *
 * ### Why the name is the mark's next sibling and nothing wraps it
 *
 * `labels/group-css.ts` and `./pointer-css.ts` both quiet a name by naming the `+ text` beside its
 * mark, so anything drawn between the two would leave every label bright over a mark that had gone
 * dim. That is also why the name is haloed rather than plated against the arcs it is written across —
 * `./line-css.ts`'s `POINT` carries the whole of that argument, and a plate is the element that would
 * have sat in between.
 */
export function FeaturePointMark(props: FeaturePointMarkProps) {
  const { bar, colour, treatment, top, labelId, detail, hoverId, name, room } = props
  const y = insideRail(top, 'bar')
  const middle = pointX(bar)
  const centre = y + LAYOUT.barHeight / 2
  const shared = {
    className: NODE_CLASS[treatment],
    style: nodeStyle(treatment, colour),
    'data-end-day': bar.endDay,
    'data-detail': detail ?? undefined,
    'data-hover-id': hoverId,
    'data-feature-id': bar.id,
    'data-label-id': labelId ?? undefined,
    'data-slot': 'feature-bar',
    'data-start-day': bar.startDay,
    'data-treatment': treatment,
    'data-width': bar.width,
    'data-x': bar.x,
    'data-y': y,
  }
  const mark = isMilestone(bar) ? (
    <polygon {...shared} data-milestone="true" points={diamondPoints(middle, centre)} />
  ) : (
    <circle {...shared} cx={middle} cy={centre} r={NODE_RADIUS} />
  )
  const label = fitLabel(name, room, NODE_RADIUS + LABEL_GAP * 2)
  if (label === '') return mark
  return (
    <g>
      {mark}
      <text
        className={POINT.label}
        fill={inkOf(colour)}
        x={middle + NODE_RADIUS + LABEL_GAP}
        y={centre + BASELINE}
      >
        {label}
      </text>
    </g>
  )
}
