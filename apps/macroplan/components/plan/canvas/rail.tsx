import type { RailBox } from '@repo/canvas'
import { RailFeatures } from './rail-features'
import { RailItems } from './rail-items'
import { joinRailIds } from './selection'
import { LAYOUT, type RailFrame } from './view'

const BAND = 'fill-transparent'

const RULE = 'stroke-border'

/** Props for {@link Rail}. */
export interface RailProps {
  readonly rail: RailBox

  readonly frame: RailFrame

  readonly top: number

  /**
   * How far across to draw the band and its hairline: the **bled** width, not the range's own.
   *
   * The canvas has to reach the right edge of a pane a Server Component cannot measure, which is what
   * `view.ts`'s `BLEED_DAYS` is for. The grid was bled from the start and this was not, so every row's
   * hairline stopped at the plan's last day while the wash behind it ran on — a timeline that visibly
   * gave up partway across the pane. `CanvasLayout.drawnWidth` is the one number both now take.
   */
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
      data-name={frame.rails.get(rail.epicId) ?? ''}
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
      <RailFeatures drawnWidth={width} frame={frame} rail={rail} top={top} />
      <RailItems frame={frame} rail={rail} top={top} />
    </g>
  )
}
