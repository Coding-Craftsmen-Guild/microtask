import type { BoardWrites } from '../table/table-writes'
import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import { PlanCanvas } from '../canvas/plan-canvas'
import type { Counted } from '../canvas/view'
import type { PlanScreenModel } from '../plan-screen-model'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import { BOARD, RAIL_WIDTH } from './board-css'
import { BOARD_WORDS } from './board-words'
import { BoardFilter } from './board-filter'
import { useBoardLayout } from './use-board-layout'
import { FILTER_CSS } from './filter-css'
import { NOTHING_SELECTED_ID, SELECT_RADIO_NAME, railSelectCss } from './rail-select-css'
import { RailColumn } from './rail-column'
import { TimeHeader } from './time-header'
import { canvasWidth } from '../canvas/view'

/** Props for {@link PlanBoard}. */
export interface PlanBoardProps extends Omit<BoardWrites, 'adds' | 'offers'> {
  readonly plan: PlanScreenModel

  readonly at: Date

  readonly range: DayRange

  readonly scale: PlanScale

  readonly rung: Rung

  readonly progress: Counted

  /** Whether a rail row may be dragged to reorder the rails. */
  readonly mayReorder: boolean

  readonly root: string

  readonly routes: DrawerRoutes
}

/**
 * The timeline as a reader meets it: one scroller, with the rail names and the dates pinned to its
 * edges and the canvas moving under both.
 *
 * ### Why the rails are laid out twice
 *
 * `railLayout` is called here for the names column and again inside `PlanCanvas` for the bars. It is
 * a pure function of the plan, the schedule and the scale, and all three are the same both times, so
 * the two agree by construction — which is the property that matters, and a cheaper one to hold than
 * threading a layout through two components that otherwise share nothing. Passing it down would make
 * `PlanCanvas` take geometry it can compute, and it is the component that owns computing it.
 *
 * ### The radio that means nothing is selected
 *
 * Rendered first and checked, so the generated sheet has a resting state to return to and the board
 * is undimmed until a reader clicks a swatch. It is the one piece of the retired rail tree that had
 * to come with the column: a radio group with no unchecked state cannot be un-chosen.
 *
 * ### Two sheets, and the difference between them is the point
 *
 * `FILTER_CSS` is one rule naming an attribute, static whatever the plan holds. `railSelectCss` is
 * two rules **per rail**, generated from their ids. Keeping them apart is what keeps the cost of
 * dimming on a keystroke from growing with the plan.
 */
export function PlanBoard(props: PlanBoardProps) {
  const { plan, at, range, scale, rung, progress, place, placeItem, draw, size, root, routes } = props
  const { layout, rails } = useBoardLayout({ plan, range, scale, rung, progress, root, routes })
  const width = canvasWidth(scale, range)
  return (
    <div className={BOARD.scroller} data-slot="plan-board">
      <style>{FILTER_CSS}</style>
      <style>{railSelectCss(rails)}</style>
      <input
        className="sr-only"
        defaultChecked
        id={NOTHING_SELECTED_ID}
        name={SELECT_RADIO_NAME}
        type="radio"
      />
      <div className={BOARD.box}>
        <div className={BOARD.headerRow} data-slot="board-head">
          <div className={BOARD.corner} style={{ width: RAIL_WIDTH }}>
            <BoardFilter hint={BOARD_WORDS.hint} label={BOARD_WORDS.filter} />
          </div>
          <TimeHeader at={at} plan={plan} range={range} rung={rung} scale={scale} width={width} />
        </div>
        <div className={BOARD.bodyRow}>
          <RailColumn mayReorder={props.mayReorder} rails={rails} root={root} routes={routes} />
          <div className={BOARD.canvas}>
            <PlanCanvas
              at={at}
              draw={draw}
              layout={layout}
              size={size}
              place={place}
              placeItem={placeItem}
              plan={plan}
              progress={progress}
              range={range}
              rung={rung}
              scale={scale}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
