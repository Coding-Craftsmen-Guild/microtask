import { LAYOUT } from '../canvas/view'
import { RAIL_WIDTH, HEADER_HEIGHT } from './board-css'
import { DROP_MARK } from './create-css'
import type { Aim } from './create-aim'

const CHIP_LIFT = 6

const TICK_WIDTH = 3

/** Props for {@link DropMark}. */
export interface DropMarkProps {
  /** What the drag is pointing at, or `null` while nothing is over the board. */
  readonly aim: Aim | null
}

const paintOf = (aim: Aim): string => {
  if (aim.mark.shape !== 'box') return DROP_MARK.line
  return aim.refused ? DROP_MARK.refused : DROP_MARK.box
}

const sizeOf = (aim: Aim): { readonly width: number | string; readonly height?: number } => {
  if (aim.mark.shape === 'line') return { width: '100%' }
  if (aim.mark.shape === 'tick') return { height: LAYOUT.itemHeight, width: TICK_WIDTH }
  return { height: LAYOUT.barHeight, width: aim.mark.width }
}

/**
 * The preview under a drag: a line between rails, a box on a lane, or a tick between two items.
 *
 * Three shapes because there are three answers. A **line** spans both columns, since inserting a rail is
 * about the plan's own order rather than about any day. A **box** is two days wide where a feature would
 * land. A **tick** is the 3px marker an item slots in at — the gap it would take, drawn at item height so
 * it reads against the items either side of it rather than over the whole lane.
 *
 * A refused drop is drawn in red with its reason rather than hidden, because a drag that stops previewing
 * reads as a board that has stopped responding.
 */
export function DropMark({ aim }: DropMarkProps) {
  if (aim === null) return null
  const top = HEADER_HEIGHT + aim.mark.y
  const left = aim.mark.shape === 'line' ? 0 : RAIL_WIDTH + aim.mark.x
  return (
    <>
      <span
        className={paintOf(aim)}
        data-refused={aim.refused ? '' : undefined}
        data-slot="drop-mark"
        style={{ ...sizeOf(aim), left, top }}
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
