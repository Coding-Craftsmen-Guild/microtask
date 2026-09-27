import Link from 'next/link'
import { PLAN_DRAWERS } from '../../../lib/drawer-routes'
import { BUTTON } from '../shell/shell-css'
import { SIDEBAR_WORDS } from './sidebar-words'

/** Props for {@link SidebarActions}. */
export interface SidebarActionsProps {
  readonly planId: string

  readonly mayAddRail: boolean

  /** How many rails the plan holds, which the link carries so the form can propose a hue. */
  readonly railCount: number
}

/**
 * The tree's own action, and only its own.
 *
 * The first revision put four buttons here — add rail, add group, settings, share — in a wrapping
 * row above the filter. Three of them act on the whole plan and belong beside its name, which is
 * where {@link PlanHead} now renders them; crowded in over a rail tree they pushed the tree down,
 * wrapped onto two lines at this width, and made the one action that *is* about rails compete with
 * three that are not.
 */
export function SidebarActions({ planId, mayAddRail, railCount }: SidebarActionsProps) {
  if (!mayAddRail) return null
  return (
    <Link className={BUTTON.quiet} data-slot="sidebar-actions" href={PLAN_DRAWERS.newRail(planId, railCount)}>
      {SIDEBAR_WORDS.newRail}
    </Link>
  )
}
