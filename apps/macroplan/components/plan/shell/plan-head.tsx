import Link from 'next/link'
import type { ReactNode } from 'react'
import type { PlanScreenModel } from '../plan-screen-model'
import { HEAD } from './shell-css'

const PLANS = 'Plans'

/** Props for {@link PlanHead}. */
export interface PlanHeadProps {
  readonly plan: PlanScreenModel

  /**
   * Where the breadcrumb climbs to, or nothing for a surface with no plan list.
   *
   * The seat surface holds one plan and has no index above it, so it draws **no crumb at all**. The
   * alternative was the word "Plans" as plain text, and a breadcrumb whose parent is not a place is
   * a promise of somewhere to go back to that a holder does not have — worse than no breadcrumb,
   * because following it is the natural thing to try. A link there would be worse still: `/plans`
   * reads a cookie they have not got and bounces them to a sign-in page with no password behind it.
   */
  readonly home: string | null

  /** Whole-plan actions, already filtered by what this viewer may do. */
  readonly actions: ReactNode

  /** The attention summary, when anything needs looking at. */
  readonly attention: ReactNode
}

/**
 * The plan's identity and the actions that act on the whole of it.
 *
 * The calendar facts sit under the name as a single muted line rather than as their own paragraph:
 * they are how to read the axis below, and a reader consults them once and then ignores them.
 */
export function PlanHead({ plan, home, actions, attention }: PlanHeadProps) {
  return (
    <div className={HEAD.row} data-slot="plan-head">
      <div className="min-w-0">
        {home === null ? null : (
          <div className={HEAD.crumbs}>
            <Link className={HEAD.crumbLink} href={home}>
              {PLANS}
            </Link>
            <span aria-hidden="true">/</span>
          </div>
        )}
        <h1 className={HEAD.title}>{plan.name}</h1>
        <p className={HEAD.meta}>
          <span>{`starts ${plan.startDate}`}</span>
          <span aria-hidden="true">·</span>
          <span>{`${String(plan.sprintLengthDays)}-day sprints`}</span>
          <span aria-hidden="true">·</span>
          <span>{plan.timezone}</span>
          {attention}
        </p>
      </div>
      <span className={HEAD.spacer} />
      <div className={HEAD.actions}>{actions}</div>
    </div>
  )
}
