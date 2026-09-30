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
export function FeatureNode({ bar, colour, treatment, top, labelId }: FeatureNodeProps) {
  const y = insideRail(top, 'bar')
  const centre = y + LAYOUT.barHeight / 2
  const shared = {
    className: NODE_CLASS[treatment],
    'data-end-day': bar.endDay,
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
