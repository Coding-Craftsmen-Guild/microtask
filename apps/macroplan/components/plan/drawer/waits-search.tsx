import type { ReactNode } from 'react'
import { ListSearch } from './list-search'
import { EDGES } from './list-css'

const ADD = '+ Add'

const FIND = 'Search features'

/** Props for {@link WaitsSearch}. */
export interface WaitsSearchProps {
  /** One row per candidate, each wrapped in the element the search filters on. */
  readonly children: ReactNode
}

/**
 * The alternatives, behind one Add: a search box and the rows it hides.
 *
 * It is a `details` that opens **in flow**, which is the design's own call for this control and the right
 * one: the panel body scrolls, so a floating list opened from a column near the bottom of it would be cut
 * off with no way to reach the rest. Opening it pushes what is under it down.
 *
 * The Add sits under the chips rather than at the end of their row, which is the one departure. A
 * `details` inside that wrapping row would open its panel inside a flex item sized to its own summary, so
 * the list would be as wide as the words "+ Add".
 */
export function WaitsSearch({ children }: WaitsSearchProps) {
  return (
    <details data-slot="waits-add">
      <summary className={EDGES.add}>{ADD}</summary>
      <div className={EDGES.panel} data-slot="pick-panel">
        <ListSearch hint={FIND} label={FIND} />
        <div className={EDGES.rows}>{children}</div>
      </div>
    </details>
  )
}
