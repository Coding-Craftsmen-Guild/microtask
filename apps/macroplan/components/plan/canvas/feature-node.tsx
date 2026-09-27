import { diamondPoints, isMilestone } from '@repo/canvas'
import type { FeatureBar, Treatment } from '@repo/canvas'
import { hueStyle, TREATMENT_CLASS } from './treatments'
import { insideRail, LAYOUT } from './view'

const NODE_RADIUS = 5

/** Props for {@link FeatureNode}, the same five a bar takes, since it draws the same feature. */
export interface FeatureNodeProps {
  /** The bar the layout computed, read for its id, its start x and its days. */
  readonly bar: FeatureBar

  /** Its rail's epic's own `#rrggbb`, or `null` for a rail no epic claims. */
  readonly colour: string | null

  /** How its schedule says to draw it. */
  readonly treatment: Treatment

  /** The y of its rail's own band. */
  readonly top: number

  /** The group this feature is in, or `null`; lands as `data-label-id` and paints nothing. */
  readonly labelId: string | null
}

/**
 * One feature at the epic rung: a node on its rail, or a diamond when it takes no time.
 *
 * ### Why a node and not a narrow bar
 *
 * §5's epic row is "epic rails, feature nodes, dependency arcs, milestones as diamonds", and the reason
 * is arithmetic rather than taste. At `ZOOM_STOPS.epic`'s 4px a day a four-day feature is sixteen px of
 * bar, which is narrower than the rounding on its own corners; a ten-day one is forty. Drawn as bars a
 * year of work is a row of ticks of barely distinguishable length, and the thing the epic rung exists to
 * show — which lanes are advancing, and where they wait on each other — is exactly what gets lost.
 *
 * ### It is placed at the start, not the middle
 *
 * `bar.x` is the feature's first day. A node centred on the *middle* of its span would read better in
 * isolation and would be wrong here for two reasons: a rail would no longer be left-to-right in start
 * order once two features of very different lengths sat side by side, and an arc — which `arcLayout`
 * sends to a bar's **start** — would arrive at a point the node was not on. Both files agree because
 * neither chose: the span decides.
 *
 * A milestone is the one case where start and middle are the same point, which is why the diamond needs
 * no separate rule about where it sits.
 *
 * ### The same attributes as a bar, under the same slot
 *
 * `data-slot="feature-bar"` and the carried `data-x`, `data-y`, `data-width` and the two days, exactly
 * as `feature-bar.tsx` writes them. So `selection.ts` rebuilds a layout from the epic rung's markup
 * without being told which rung drew it, the group stylesheet dims a node it would have dimmed a bar,
 * and a drag works at every rung. `data-width` carries the feature's **real** width — often a couple of
 * px here, and `0` for a milestone — and not the node's drawn size, because that is the number a drop is
 * ordered against and a node's radius is a drawing decision.
 */
export function FeatureNode({ bar, colour, treatment, top, labelId }: FeatureNodeProps) {
  const y = insideRail(top, 'bar')
  const centre = y + LAYOUT.barHeight / 2
  if (isMilestone(bar)) {
    return (
      <polygon
        className={TREATMENT_CLASS[treatment]}
        data-end-day={bar.endDay}
        data-feature-id={bar.id}
        data-label-id={labelId ?? undefined}
        data-milestone="true"
        data-slot="feature-bar"
        data-start-day={bar.startDay}
        data-treatment={treatment}
        data-width={bar.width}
        data-x={bar.x}
        data-y={y}
        points={diamondPoints(bar.x, centre)}
        style={hueStyle(treatment, colour)}
      />
    )
  }
  return (
    <circle
      className={TREATMENT_CLASS[treatment]}
      cx={bar.x}
      cy={centre}
      data-end-day={bar.endDay}
      data-feature-id={bar.id}
      data-label-id={labelId ?? undefined}
      data-slot="feature-bar"
      data-start-day={bar.startDay}
      data-treatment={treatment}
      data-width={bar.width}
      data-x={bar.x}
      data-y={y}
      r={NODE_RADIUS}
      style={hueStyle(treatment, colour)}
    />
  )
}
