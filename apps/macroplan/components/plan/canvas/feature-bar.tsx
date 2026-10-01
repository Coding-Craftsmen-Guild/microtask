import type { FeatureBar, Treatment } from '@repo/canvas'
import { diamondPoints, isMilestone } from '@repo/canvas'
import { hueStyle, TREATMENT_CLASS } from './treatments'
import { BAR_GAP, insideRail, LAYOUT } from './view'

const BAR_RADIUS = 6

/** Props for {@link FeatureBarMark}. */
export interface FeatureBarMarkProps {
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
   * The same value as `data-feature-id` on a bar and deliberately a second attribute, because the two
   * are read by different things and mean different things: `data-feature-id` is geometry the drag and
   * the selection sheet answer against, and this is "light me when that feature is pointed at". An item
   * mark and a bar label carry their **feature's** id here and not their own, so pointing at any part of
   * a feature lights all of it.
   */
  readonly hoverId: string
}

/**
 * One feature as a bar spanning the days it takes.
 *
 * ### The gap is drawn, not scheduled
 *
 * Features on a rail are scheduled back to back: one ends on the day the next begins, so their bars
 * share a boundary exactly and a run of them paints as one long block. Each bar is therefore pulled
 * in by {@link BAR_GAP} at both ends, which is enough air to see the join and little enough that no
 * bar appears to start a day late.
 *
 * The inset is **presentation only**. `data-x` and `data-width` still carry the true geometry,
 * because that is what `selection.ts` reads to answer where a drag started and where it landed — a
 * drag measured against the drawn edge would be off by the gap on every drop, which is the kind of
 * error that looks like a rounding bug and is a deliberate visual offset.
 *
 * A milestone takes no time and so has no width to inset; it keeps its diamond, which is the shape
 * that tells a zero-day mark from a bar too narrow to read.
 */
export function FeatureBarMark(props: FeatureBarMarkProps) {
  const { bar, colour, treatment, top, labelId, detail, hoverId } = props
  const y = insideRail(top, 'bar')
  const shared = {
    className: TREATMENT_CLASS[treatment],
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
    style: hueStyle(treatment, colour),
  }
  if (isMilestone(bar)) {
    return (
      <polygon {...shared} data-milestone="true" points={diamondPoints(bar.x, y + LAYOUT.barHeight / 2)} />
    )
  }
  return (
    <rect
      {...shared}
      height={LAYOUT.barHeight}
      rx={BAR_RADIUS}
      width={Math.max(bar.width - BAR_GAP * 2, 1)}
      x={bar.x + BAR_GAP}
      y={y}
    />
  )
}
