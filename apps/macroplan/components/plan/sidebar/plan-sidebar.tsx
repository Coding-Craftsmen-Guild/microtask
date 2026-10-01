import type { ReactNode } from 'react'
import type { AttentionMap } from '../attention/attention'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import { RailTree } from './rail-tree'
import { NOTHING_SELECTED_ID, SELECT_RADIO_NAME, selectCss } from './select-css'
import { SIDE, TREE_CSS } from './sidebar-css'
import { SidebarSearch } from './sidebar-search'
import type { SidebarRail } from './sidebar-rows'
import { SIDEBAR_WORDS } from './sidebar-words'

/** Props for {@link PlanSidebar}. */
export interface PlanSidebarProps {
  readonly root: string

  readonly routes: DrawerRoutes

  readonly rails: readonly SidebarRail[]

  /** The one action that belongs to the tree: add a rail. Nothing for a viewer who may not. */
  readonly actions: ReactNode

  readonly found: AttentionMap
}

/**
 * The rail tree: a sticky head with the filter, then every rail and its features.
 *
 * The radio that means *nothing is selected* is rendered first and checked, so the generated sheet
 * has a resting state to return to and the board is undimmed until a reader picks a row.
 *
 * Two sheets, and the difference between them is the point: {@link TREE_CSS} is two rules naming slots,
 * static whatever the plan holds, and `selectCss` is two rules per rail and per feature, generated from
 * their ids. Keeping them apart is what keeps the collapsing of a rail from growing with the plan.
 */
export function PlanSidebar({ root, routes, rails, actions, found }: PlanSidebarProps) {
  return (
    <div className="min-w-0" data-slot="plan-sidebar">
      <style>{TREE_CSS}</style>
      <style>{selectCss(rails)}</style>
      <input
        className="sr-only"
        defaultChecked
        id={NOTHING_SELECTED_ID}
        name={SELECT_RADIO_NAME}
        type="radio"
      />
      <div className={SIDE.head}>
        <div className={SIDE.headRow}>
          <span className={SIDE.heading}>{SIDEBAR_WORDS.rails}</span>
          {actions}
        </div>
        {rails.length === 0 ? null : (
          <SidebarSearch hint={SIDEBAR_WORDS.hint} label={SIDEBAR_WORDS.search} />
        )}
      </div>
      {rails.length === 0 ? <p className={SIDE.none}>{SIDEBAR_WORDS.noRails}</p> : null}
      <RailTree
        found={found}
        noFeatures={SIDEBAR_WORDS.noFeatures}
        rails={rails}
        root={root}
        routes={routes}
      />
    </div>
  )
}
