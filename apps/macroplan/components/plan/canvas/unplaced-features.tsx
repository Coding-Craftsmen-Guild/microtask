import { hueStyle, TREATMENT_CLASS } from './treatments'
import { LAYOUT, type RailFrame } from './view'

const STUB_WIDTH = 22

const STUB_GAP = 5

const STUB_RADIUS = 3

/** Props for {@link UnplacedFeatures}. */
export interface UnplacedFeaturesProps {
  /** The rail's features the forward pass left off the axis, in its own `(position, id)` order. */
  readonly featureIds: readonly string[]

  /** The rail's epic's own `#rrggbb`, or `null` for a rail no epic claims. */
  readonly colour: string | null

  /** Everything every rail on this canvas shares, read here for its treatments and its axis edge. */
  readonly frame: RailFrame

  /** The y of the rail's own band. */
  readonly top: number
}

/**
 * A rail's unplaced features, as hollow stubs in the label gutter — off the axis, because they have
 * no position on it.
 *
 * This is the one place either non-solid treatment can be seen at all, and the reason it exists.
 * `railLayout` **omits** a feature with no span rather than drawing it at zero width: "'nothing was
 * sized' is a different sentence from 'placed at day zero taking no time' — which is what a zero-day
 * milestone is, and that one does get a bar." So a canvas drawing only `rail.bars` renders an
 * unestimated feature as nothing whatever, and `treatmentOf` says where the missing drawing belongs:
 * "an unplaced feature is absent from `spans`, so it has no bar, and a list of unplaced features
 * drawn from the plan is where those two treatments get rendered."
 *
 * They are drawn **in the gutter and never on the axis**, growing leftward from the axis's own left
 * edge. An unplaced feature has no `startDay`, so any x on the axis would be a claim about when it
 * happens, and a stub at day 0 is exactly the zero-length bar the omission was avoiding. The gutter
 * is off-axis by construction, and leftward means a rail with more unplaced features than the gutter
 * holds loses them off the `viewBox`'s left edge rather than pushing a row of stubs across the
 * timeline where they would read as placed work.
 *
 * That clipping is a real limit of this rendering and not a complete answer: spec §5's answer is the
 * conflict list, which phase 3 ships and which enumerates every one of them with the reason. What
 * this buys until then is that an unestimated feature is visible at all, in its epic's own hue, on
 * its own rail.
 */
export function UnplacedFeatures({ featureIds, colour, frame, top }: UnplacedFeaturesProps) {
  return (
    <g data-slot="unplaced-features">
      {featureIds.map((id, index) => {
        const treatment = frame.treatments.get(id) ?? 'solid'
        return (
          <rect
            className={TREATMENT_CLASS[treatment]}
            data-feature-id={id}
            data-placed="false"
            data-slot="feature-bar"
            data-treatment={treatment}
            height={LAYOUT.barHeight}
            key={id}
            rx={STUB_RADIUS}
            style={hueStyle(treatment, colour)}
            width={STUB_WIDTH}
            x={frame.axisX - LAYOUT.labelInset - (index + 1) * (STUB_WIDTH + STUB_GAP)}
            y={top + LAYOUT.barTop}
          />
        )
      })}
    </g>
  )
}
