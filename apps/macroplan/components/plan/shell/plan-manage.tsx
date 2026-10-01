import type { ReactNode } from 'react'
import { MenuButton } from './menu-button'

/** What the whole-plan actions are called, in one record. */
export const MANAGE_WORDS = {
  settings: 'Settings',
} as const

/** Props for {@link PlanManage}. */
export interface PlanManageProps {
  /**
   * The plan's own name, calendar and deletion, or `null` for a viewer who may change none of them.
   *
   * Markup rather than a plan and three actions, because this is the one slot both surfaces fill
   * with the same three forms built from different writes: the admin's go out under a cookie and a
   * seat's under its token (`seat-own-actions.ts`). It is also the one exception
   * `../module-boundaries.test.tsx` states — markup on `children`, and nothing about a plan crossing
   * a client boundary as data.
   */
  readonly settings: ReactNode

  /**
   * The seats over this plan, or `null` for a viewer who may neither list nor mint one.
   *
   * It brings its **own** opener, which is the one asymmetry in this row and a deliberate one:
   * `ShareManager` may not have its panel in the DOM before somebody opens it, because what loads
   * into it is a list of live credentials (ADR 0033). A `<details>` has its content mounted whether
   * open or shut, so it is the wrong disclosure for that one panel, and this slot takes the finished
   * control rather than its contents.
   */
  readonly share: ReactNode
}

/**
 * The actions that act on the whole plan, at the end of its title row.
 *
 * ### Why these stopped being routes
 *
 * Both were drawers at `/plans/<id>/settings` and `/plans/<id>/share`: a 28rem panel over the plan,
 * behind a scrim that dimmed everything else, for a three-field form and a list of links. ADR 0057's
 * case for a route is about **selection** — one feature or one item out of two thousand, worth
 * addressing, worth reloading, worth sending to somebody — and neither of these selects anything.
 * Neither is about anything on the board either, so neither needs the board covered to be used.
 *
 * What that record's argument still buys is kept where it applies: a feature and an item are still
 * routes, and the panel they open in is still addressable.
 *
 * ### Share is the primary weight
 *
 * It is the one thing a person does with a plan that produces something for somebody else. Settings
 * is quiet beside it, and it is first in the row so that a reader reaching for Share does not pass
 * `Delete this plan` on the way.
 */
export function PlanManage({ settings, share }: PlanManageProps) {
  return (
    <>
      {settings === null ? null : (
        <MenuButton label={MANAGE_WORDS.settings} slot="plan-settings-menu" tone="quiet">
          {settings}
        </MenuButton>
      )}
      {share}
    </>
  )
}

