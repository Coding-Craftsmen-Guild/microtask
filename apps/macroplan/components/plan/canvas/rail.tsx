import type { RailBox } from '@repo/canvas'
import { RailFeatures } from './rail-features'
import { ItemMarkShape } from './item-mark'
import { joinRailIds } from './selection'
import { hueOf, LAYOUT, type RailFrame } from './view'

const BAND = 'fill-transparent'

const RULE = 'stroke-border'

/** Props for {@link Rail}. */
export interface RailProps {
  readonly rail: RailBox

  readonly frame: RailFrame

  readonly top: number

  /** How wide the canvas is, for the band's own hairline. */
  readonly width: number
}

/**
 * One rail band: a rule under it, its bars, and the item ticks beneath them.
 *
 * The rail's **name is not here** — it is an HTML row in the column beside the canvas, for the
 * reasons `board-css.ts` sets out. What is left is geometry, which is why this took a `name` prop
 * and no longer does.
 *
 * The hairline is drawn per rail rather than once for the grid because it has to fall at the bottom
 * of each band, and a band's height is this component's own number.
 */
export function Rail({ rail, frame, top, width }: RailProps) {
  return (
    <g
      data-colour={rail.colour ?? undefined}
      data-epic-id={rail.epicId}
      data-feature-ids={joinRailIds(rail.featureIds)}
      data-slot="rail"
    >
      <rect className={BAND} height={LAYOUT.railHeight} width={width} x={0} y={top} />
      <line
        className={RULE}
        x1={0}
        x2={width}
        y1={top + LAYOUT.railHeight}
        y2={top + LAYOUT.railHeight}
      />
      <RailFeatures frame={frame} rail={rail} top={top} />
      {frame.draws.items
        ? rail.bars.flatMap((bar) =>
            (frame.marks.get(bar.id) ?? []).map((mark) => (
              <ItemMarkShape
                colour={hueOf(frame, bar.id, rail.colour)}
                detail={frame.details.get(mark.id) ?? null}
                hoverId={bar.id}
                key={mark.id}
                labelId={frame.groups.get(bar.id) ?? null}
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
