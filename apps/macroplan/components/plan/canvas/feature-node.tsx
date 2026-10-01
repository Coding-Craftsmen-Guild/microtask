import { diamondPoints, isMilestone } from '@repo/canvas'
import type { FeatureBar, Treatment } from '@repo/canvas'
import { nodeStyle, NODE_CLASS } from './treatments'
import { insideRail, LAYOUT, NODE_RADIUS } from './view'

/** Props for {@link FeatureNode}. */
export interface FeatureNodeProps {
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
 * One feature as a point on its rail, at the day it starts.
 *
 * ### The halo
 *
 * Every node carries a stroke in the page's own background colour rather than in its rail's hue. Two
 * features a few days apart are a few pixels apart at the Year rung, and two filled circles that
 * touch read as one lozenge; a ring the colour of what is behind them cuts a gap between them
 * whatever they are sitting on. It is the same device a git graph uses, and for the same reason.
 *
 * It also lifts the node off the dependency arc running under it, which would otherwise appear to
 * pass through the middle of every point it joins.
 *
 * ### A milestone keeps its diamond
 *
 * A milestone is a point that takes no time, so at these rungs it and an ordinary feature are drawn
 * at the same size and in the same place — and the only thing left to tell them apart is the shape.
 * That is the shape's whole job here, where at the Sprint rung it also distinguishes a zero-width
 * mark from a bar.
 */
export function FeatureNode(props: FeatureNodeProps) {
  const { bar, colour, treatment, top, labelId, detail, hoverId } = props
  const y = insideRail(top, 'bar')
  const centre = y + LAYOUT.barHeight / 2
  const shared = {
    className: NODE_CLASS[treatment],
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
    style: nodeStyle(treatment, colour),
  }
  if (isMilestone(bar)) {
    return <polygon {...shared} data-milestone="true" points={diamondPoints(bar.x, centre, NODE_RADIUS + 1)} />
  }
  return <circle {...shared} cx={bar.x} cy={centre} r={NODE_RADIUS} />
}
