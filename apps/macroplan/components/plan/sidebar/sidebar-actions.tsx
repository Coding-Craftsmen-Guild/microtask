import Link from 'next/link'
import { PLAN_DRAWERS } from '../../../lib/drawer-routes'
import { SIDEBAR_WORDS } from './sidebar-words'

const ROW = 'flex flex-wrap gap-1.5'

const PRIMARY =
  'rounded-md bg-brand px-2.5 py-1 text-[13px] font-semibold text-background hover:opacity-90'

const SECONDARY =
  'rounded-md px-2.5 py-1 text-[13px] font-medium text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground'

/** Props for {@link SidebarActions}: one boolean per control, which is the house shape. */
export interface SidebarActionsProps {
  /** The plan every link is built against. */
  readonly planId: string

  /** Whether this reader may make a rail — the control that makes an empty plan usable. */
  readonly mayAddRail: boolean

  /** Whether they may make a group. */
  readonly mayAddGroup: boolean

  /** Whether they may change the plan's name, calendar or existence. */
  readonly maySettings: boolean

  /** Whether they may read or mint a seat over this plan. */
  readonly mayShare: boolean
}

/**
 * The four things done to a plan rather than to work in it, as links to their drawers.
 *
 * ### Why links and not disclosures
 *
 * These four were five collapsed `<details>` in the plan heading, and that is the whole of design §4's
 * complaint: a disclosure closed by default is a reasonable home for a rare administrative act and the wrong
 * home for **the only way to create anything**. Two separate reports of "there is no option to add anything"
 * came from exactly this arrangement. A link is visible, is an address, and is refused in one place — the
 * route — rather than by a panel that had to be both conditionally mounted and internally conditional.
 *
 * ### Add rail is painted as the primary action
 *
 * It is the one control an empty plan cannot do without: a feature names the rail it sits on, so a plan with
 * no rails admits no feature, no item, no estimate and no bar. The other three are things you do to a plan
 * that already works. Paint follows that rather than treating four links as peers.
 *
 * Each is drawn on its own answer, so a reader who may add a feature but not a rail is not shown a link to a
 * route that would 404 them. The route checks again — these booleans are rendering answers and never gates
 * (`lib/plan-capabilities.ts`).
 */
export function SidebarActions(props: SidebarActionsProps) {
  const { planId, mayAddRail, mayAddGroup, maySettings, mayShare } = props
  return (
    <div className={ROW} data-slot="sidebar-actions">
      {mayAddRail ? (
        <Link className={PRIMARY} href={PLAN_DRAWERS.newRail(planId)}>
          {SIDEBAR_WORDS.newRail}
        </Link>
      ) : null}
      {mayAddGroup ? (
        <Link className={SECONDARY} href={PLAN_DRAWERS.newGroup(planId)}>
          {SIDEBAR_WORDS.newGroup}
        </Link>
      ) : null}
      {maySettings ? (
        <Link className={SECONDARY} href={PLAN_DRAWERS.settings(planId)}>
          {SIDEBAR_WORDS.settings}
        </Link>
      ) : null}
      {mayShare ? (
        <Link className={SECONDARY} href={PLAN_DRAWERS.share(planId)}>
          {SIDEBAR_WORDS.share}
        </Link>
      ) : null}
    </div>
  )
}
