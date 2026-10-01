import Link from 'next/link'
import { PLAN_DRAWERS } from '../../../lib/drawer-routes'
import { BUTTON } from './shell-css'

const WORDS = {
  settings: 'Settings',
  share: 'Share',
} as const

/** Props for {@link PlanManage}. */
export interface PlanManageProps {
  readonly planId: string

  readonly maySettings: boolean

  readonly mayShare: boolean
}

/**
 * The actions that act on the whole plan, at the end of its title row.
 *
 * Share is the primary weight: it is the one thing a person does with a plan that produces something
 * for somebody else, and it was previously a quiet button in the sidebar behind three others.
 *
 * Every one is a link to a drawer route rather than a disclosure that expands in place (ADR 0057),
 * so each is addressable, reloadable and steps back out of.
 */
export function PlanManage({ planId, maySettings, mayShare }: PlanManageProps) {
  return (
    <>
      {maySettings ? (
        <Link className={BUTTON.quiet} href={PLAN_DRAWERS.settings(planId)}>
          {WORDS.settings}
        </Link>
      ) : null}
      {mayShare ? (
        <Link className={BUTTON.primary} href={PLAN_DRAWERS.share(planId)}>
          {WORDS.share}
        </Link>
      ) : null}
    </>
  )
}
