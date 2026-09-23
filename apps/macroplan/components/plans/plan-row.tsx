import type { Decoded } from '@repo/api-client'
import type { PlanListItem } from '@repo/contracts'
import { buttonVariants } from '@repo/ui/components/button'
import { RelativeTime } from '@repo/ui/shell/relative-time'
import Link from 'next/link'
import { planPath } from '../../lib/routes'

/**
 * A plan as the index row needs it, which is the contract's own list row and not a copy of it.
 *
 * Restating the eleven fields as an interface here would be a second declaration of a wire shape
 * that already has one, free to drift from it (ADR 0036) — and the field this row is most careful
 * about, `shareLinkCount`, is exactly the one a hand-written copy would get wrong. It carries
 * settings and three counts and **never** contents: at this product's bounds a list is 200 plans
 * holding up to 2,000 items each, which is 400,000 items on the one screen that renders none.
 */
export type ListedPlan = Decoded<typeof PlanListItem>

/** Props for {@link PlanRow}. */
export interface PlanRowProps {
  /** The plan, as the list read it. */
  plan: ListedPlan

  /** The instant the page was rendered, decided once so server and browser agree. */
  now: number
}

const plural = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count === 1 ? '' : 's'}`

const countsLine = (plan: ListedPlan): string =>
  [
    plural(plan.epicCount, 'epic'),
    plural(plan.featureCount, 'feature'),
    plural(plan.itemCount, 'item'),
    ...(plan.shareLinkCount === undefined ? [] : [plural(plan.shareLinkCount, 'share link')]),
  ].join(' · ')

/**
 * One row of the plans index: the plan's name, what it holds, how it is timed, and when it changed.
 *
 * The share-link clause is absent exactly when `shareLinkCount` is, and `0 share links` is
 * rendered when the count is zero. The two are different sentences — "this plan has no seats" and
 * "you were not told how many it has" — and only a caller the API granted `share:read` is told
 * either (ADR 0013, ADR 0033). Microtask's row omits its own clause at zero as well, to match copy
 * measured off the app it replaced; this product has no such wording to reproduce, so it says the
 * zero and keeps the absence visible.
 *
 * No progress bar and no chips. A plan's shape is its timeline, which is the page this row opens,
 * and the counts are what a list can say without reading anything it refuses to carry.
 */
export function PlanRow({ plan, now }: PlanRowProps) {
  const href = planPath(plan.id)
  return (
    <div className="flex items-center gap-4 rounded-xl bg-card px-4 py-3.5 ring-1 ring-foreground/10 max-sm:flex-wrap">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Link className="font-semibold text-foreground no-underline" data-testid="plan-name" href={href}>
          {plan.name}
        </Link>
        <p className="text-[13px] text-muted-foreground" data-testid="plan-counts">
          {countsLine(plan)}
        </p>
        <p className="text-[13px] text-muted-foreground" data-testid="plan-settings">
          {`starts ${plan.startDate} · ${String(plan.sprintLengthDays)}-day sprints · ${plan.timezone} · updated `}
          <RelativeTime from={plan.updatedAt} now={now} />
        </p>
      </div>
      <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={href}>
        Open
      </Link>
    </div>
  )
}
