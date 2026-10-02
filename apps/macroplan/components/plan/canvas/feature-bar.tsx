import type { FeatureBar, Treatment } from '@repo/canvas'
import { diamondPoints, isMilestone } from '@repo/canvas'
import { fitLabel } from './mark-label'
import { ITEM } from './line-css'
import { hueStyle, TREATMENT_CLASS } from './treatments'
import { BAR_GAP, insideRail, LAYOUT } from './view'

const BAR_RADIUS = 6

const LABEL_PAD = 7

const BASELINE = 18

const inkOf = (colour: string | null): string | undefined =>
  colour === null ? undefined : `color-mix(in oklch, ${colour} 60%, black)`

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
   * the selection sheet answer against, and this is "light me when that feature is pointed at".
   */
  readonly hoverId: string

  /** The feature's own name, cut to the bar's width or dropped where it will not fit. */
  readonly name: string
}

/**
 * One feature as a bar spanning the days it takes — the Quarter and Year stops' mark.
 *
 * The Sprint stop draws a **line** with its items as bars beneath (`./feature-line.tsx`). These two
 * stops draw no items at all, so the feature has the band to itself and a bar is the clearer shape:
 * it says the span and gives the name somewhere to sit.
 *
 * Both of them drew a **dot** before this, on the argument that at fourteen pixels a day a bar is a
 * smear whose width nobody can read. That argument was about the width being *illegible*, and it
 * stands — what has changed is that an illegible width is no longer the only thing a mark carries.
 * `./mark-label.ts` cuts a name to the room there is and drops it outright below four characters, so
 * a narrow feature at the Year stop is a bar with no words rather than a bar with a clipped letter.
 * A reader gets position, span and, wherever the plan is read closely enough to matter, a name.
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
 * A milestone takes no time and so has no width to inset or to write in; it keeps its diamond, which
 * is the shape that tells a zero-day mark from a bar too narrow to read.
 *
 * A bar too narrow for its own name is the bare rect it always was, with no `<g>` around it: a group
 * holding one child is an element per feature for nothing, on a canvas whose element count is the one
 * number that grows with the plan.
 */
export function FeatureBarMark(props: FeatureBarMarkProps) {
  const { bar, colour, treatment, top, labelId, detail, hoverId, name } = props
  const y = insideRail(top, 'bar')
  const width = Math.max(bar.width - BAR_GAP * 2, 1)
  const shared = {
    className: TREATMENT_CLASS[treatment],
    style: hueStyle(treatment, colour),
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
  if (isMilestone(bar)) {
    return (
      <polygon {...shared} data-milestone="true" points={diamondPoints(bar.x, y + LAYOUT.barHeight / 2)} />
    )
  }
  const label = fitLabel(name, width, LABEL_PAD * 2)
  const rect = (
    <rect {...shared} height={LAYOUT.barHeight} rx={BAR_RADIUS} width={width} x={bar.x + BAR_GAP} y={y} />
  )
  if (label === '') return rect
  return (
    <g>
      {rect}
      <text className={ITEM.label} fill={inkOf(colour)} x={bar.x + BAR_GAP + LABEL_PAD} y={y + BASELINE}>
        {label}
      </text>
    </g>
  )
}
