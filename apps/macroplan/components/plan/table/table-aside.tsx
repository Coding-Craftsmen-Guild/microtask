import { memo, useDeferredValue, useEffect, useState } from 'react'
import { VIEW_SWITCH } from '../view-switch'
import { PlanTable, type PlanTableProps } from './plan-table'

const OFF_SCREEN = 'sr-only'

const QuietTable = memo(PlanTable)

/** Props for {@link TableAside}. */
export interface TableAsideProps extends PlanTableProps {
  /** Whether the table is the rendering on screen, rather than the one kept for assistive tech. */
  readonly shown: boolean
}

/**
 * The table, on screen when it is chosen and off screen when it is not — but never in the way.
 *
 * It is the accessible rendering of the plan, so it stays mounted whichever view is chosen (ADR 0056).
 * At this product's cap that is 2,200 rows, which used to be rendered and re-rendered with the canvas on
 * every request, edit and zoom. Three things keep it from costing an interaction anything (ADR 0069):
 *
 * - **It mounts after the screen has painted**, off screen, so the first paint is the board alone.
 * - **It renders from a deferred plan while it is off screen**, so React draws an edit on the board first
 *   and the table after, in a render an input can interrupt. Chosen, it renders from the live plan.
 * - **It is memoised**, so a zoom, a drawer or a hover — none of which changes a row — leaves it alone.
 *
 * Its own state (search, filters, sort, column order) lives inside it and survives the switch, because the
 * element never unmounts once it has mounted.
 */
export function TableAside({ shown, ...table }: TableAsideProps) {
  const deferred = useDeferredValue(table.plan)
  const [ready, setReady] = useState(shown)
  if (shown && !ready) setReady(true)
  useEffect(() => {
    if (ready) return undefined
    const later = setTimeout(() => setReady(true), 0)
    return () => clearTimeout(later)
  }, [ready])
  if (!ready) return null
  return (
    <div className={shown ? VIEW_SWITCH.tablePanel : OFF_SCREEN} data-slot="table-panel">
      <QuietTable {...table} plan={shown ? table.plan : deferred} />
    </div>
  )
}
