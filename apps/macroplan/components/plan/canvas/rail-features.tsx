import type { RailBox } from '@repo/canvas'
import { FeatureBarMark } from './feature-bar'
import { FeatureNode } from './feature-node'
import type { RailFrame } from './view'

/** Props for {@link RailFeatures}. */
export interface RailFeaturesProps {
  /** The rail, read for its bars and its colour. */
  readonly rail: RailBox

  /** What every rail on this canvas shares, including which rung's marks to draw. */
  readonly frame: RailFrame

  /** The y of this rail's own band. */
  readonly top: number
}

/**
 * Every placed feature on one rail, drawn as the rung asks: a bar below the epic rung, a node at it.
 *
 * ### Why the two branches are one component
 *
 * They are one decision. `DRAWS` in `./rung-view.ts` never has `bars` and `nodes` both true, so a rail
 * draws a feature exactly once whichever rung it is at, and the two branches reading one `frame.draws`
 * side by side in `./rail.tsx` invited the reading that a canvas might draw both. Pulling them together
 * also put `Rail` back under ADR 0027's fifty-line function cap, which it went over the moment the epic
 * rung got its own mark.
 *
 * A **fragment** and not a `<g>`: `selection.ts` rebuilds a layout by asking each rail element for its
 * descendant `[data-slot="feature-bar"]`, so an extra group would be harmless — but a group with no
 * attributes is an element per rail that paints nothing, and at `LIMITS.epicsPerPlan` rails the budget
 * `item-mark.tsx` argues for is the same budget.
 *
 * Answers `null` at a rung that draws neither, which no shipped rung does. It is written rather than
 * assumed because `frame.draws` is data: a record edited to turn both off should draw nothing, not
 * fall through to bars.
 */
export function RailFeatures({ rail, frame, top }: RailFeaturesProps) {
  if (!frame.draws.bars && !frame.draws.nodes) return null
  return (
    <>
      {rail.bars.map((bar) =>
        frame.draws.nodes ? (
          <FeatureNode
            bar={bar}
            colour={rail.colour}
            key={bar.id}
            labelId={frame.groups.get(bar.id) ?? null}
            top={top}
            treatment={frame.treatments.get(bar.id) ?? 'solid'}
          />
        ) : (
          <FeatureBarMark
            bar={bar}
            colour={rail.colour}
            key={bar.id}
            labelId={frame.groups.get(bar.id) ?? null}
            top={top}
            treatment={frame.treatments.get(bar.id) ?? 'solid'}
          />
        ),
      )}
    </>
  )
}
