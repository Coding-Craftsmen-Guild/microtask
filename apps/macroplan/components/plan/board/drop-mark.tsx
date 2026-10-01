import { LAYOUT } from '../canvas/view'
import { RAIL_WIDTH, HEADER_HEIGHT } from './board-css'
import { DROP_MARK } from './create-css'
import type { Aim } from './create-aim'

const CHIP_LIFT = 6

/** Props for {@link DropMark}. */
export interface DropMarkProps {
  /** Where the drop would land, or `null` while nothing is over the board. */
  readonly aim: Aim | null
}

/**
 * The line or box drawn where a drop would land, with a chip saying what it would make.
 *
 * ### Why the offsets are constants and not a measurement
 *
 * The mark is positioned in the **canvas's** own pixels, and it is drawn in a box that wraps the
 * whole board — so every y gains the header's height and every x the rail column's width to reach the
 * same place on screen. Both are constants this module imports from the one place that declares them
 * (`./board-css.ts`), which is what keeps the preview and the thing it is previewing in step without
 * either measuring the other. `happy-dom` measures nothing, so a layout that needed a measurement
 * here would be a layout no test could check at all.
 *
 * ### Why an epic's line crosses both columns
 *
 * It is drawn from x zero, across the rail names as well as the canvas, because a rail is a row of
 * both and inserting one inserts a name as much as a lane. A line that stopped at the column's edge
 * would say the new rail was going on the canvas only.
 *
 * ### Why the chip is above the mark
 *
 * Under it, it would cover the next lane down — which at a 44px lane is the thing the reader is
 * trying to aim between. Above it, the one case it covers is the lane the drop is already on.
 */
export function DropMark({ aim }: DropMarkProps) {
  if (aim === null) return null
  const line = aim.mark.shape === 'line'
  const top = HEADER_HEIGHT + aim.mark.y
  const left = line ? 0 : RAIL_WIDTH + aim.mark.x
  return (
    <>
      <span
        className={line ? DROP_MARK.line : aim.refused ? DROP_MARK.refused : DROP_MARK.box}
        data-refused={aim.refused ? '' : undefined}
        data-slot="drop-mark"
        style={{
          top,
          left,
          width: line ? '100%' : aim.mark.width,
          height: line ? undefined : LAYOUT.barHeight,
        }}
      />
      <span
        className={DROP_MARK.chip}
        data-slot="drop-chip"
        style={{ top: top - CHIP_LIFT, left: left + CHIP_LIFT }}
      >
        {aim.chip}
      </span>
    </>
  )
}
