import type { RailBox } from '@repo/canvas'
import { FeatureBarMark } from './feature-bar'
import { ItemMarkShape } from './item-mark'
import { joinRailIds } from './selection'
import { UnplacedFeatures } from './unplaced-features'
import { insideRail, type RailFrame } from './view'

const RAIL_LABEL = 'fill-foreground text-[12px] font-semibold'

const UNCLAIMED = 'Unclaimed rail'

/** Props for {@link Rail}. */
export interface RailProps {
  /** The rail, as `railLayout` returned it: its epic id, that epic's colour, and its placed bars. */
  readonly rail: RailBox

  /** Its epic's name, joined back from the plan, or `undefined` for a rail no epic claims. */
  readonly name: string | undefined

  /** Its features the forward pass left off the axis. */
  readonly unplaced: readonly string[]

  /** Everything every rail on this canvas shares. */
  readonly frame: RailFrame

  /** The y of this rail's own band. */
  readonly top: number
}

/**
 * One rail: its epic's name in the gutter, its placed features as bars, and their items under them.
 *
 * The name is a **join back to the plan**, not something the layout handed over: a `RailBox` carries
 * an `epicId` and a colour and no name, because `railsOf` identifies a rail by `features[0].epicId`
 * and a name is a fact about the epic record. A rail whose `epicId` names no epic in the plan says so
 * — `Unclaimed rail`, drawn in the neutral hue its `colour: null` leaves — rather than borrowing a
 * neighbour's name or being dropped, for the same reason the forward pass places it rather than
 * dropping it.
 *
 * Every treatment is read out of the shared map as `treatments.get(id) ?? 'solid'`, which is the read
 * `treatmentsOf` documents: the map holds only the non-solid marks, and a map with a `'solid'` entry
 * for all 2,000 placed items would be 2,000 entries saying what the default already says.
 *
 * What the rung decides is what goes on the rail, never the rail itself. `DRAWS` is that table, and
 * an epic-rung canvas draws every rail with its name and nothing on it — §5 puts feature nodes,
 * dependency arcs and milestone diamonds there, and none of the three is built yet.
 *
 * ### The two attributes nothing on this canvas reads
 *
 * `data-colour` and `data-feature-ids` are the two members of a `RailBox` the drawing does not otherwise
 * leave in the markup: a rail's hue reaches the SVG only as each mark's inline style, so a rail with no
 * marks carries it nowhere, and its feature **order** reaches it only as two runs of ids whose
 * interleaving is lost. `./selection.ts` reads both back, and says why a drag has to rebuild the layout
 * from the markup rather than be handed it. `data-colour` is **absent** for a rail no epic claims, which
 * is the `colour: null` the layout answered and the one `dropTargetFor` refuses a drop on — an empty
 * string would be a colour.
 */
export function Rail({ rail, name, unplaced, frame, top }: RailProps) {
  return (
    <g
      data-colour={rail.colour ?? undefined}
      data-epic-id={rail.epicId}
      data-feature-ids={joinRailIds(rail.featureIds)}
      data-slot="rail"
    >
      <text className={RAIL_LABEL} x={frame.labelX} y={insideRail(top, 'label')}>
        {name ?? UNCLAIMED}
      </text>
      {frame.draws.bars ? (
        <UnplacedFeatures colour={rail.colour} featureIds={unplaced} frame={frame} top={top} />
      ) : null}
      {frame.draws.bars
        ? rail.bars.map((bar) => (
            <FeatureBarMark
              bar={bar}
              colour={rail.colour}
              key={bar.id}
              top={top}
              treatment={frame.treatments.get(bar.id) ?? 'solid'}
            />
          ))
        : null}
      {frame.draws.items
        ? rail.bars.flatMap((bar) =>
            (frame.marks.get(bar.id) ?? []).map((mark) => (
              <ItemMarkShape
                colour={rail.colour}
                key={mark.id}
                mark={mark}
                top={top}
                treatment={frame.treatments.get(mark.id) ?? 'solid'}
              />
            )),
          )
        : null}
    </g>
  )
}
