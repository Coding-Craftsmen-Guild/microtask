import { EmptyState } from '@repo/ui/shell/empty-state'
import { PlanRow, type ListedPlan } from './plan-row'

/** Props for {@link PlanList}. */
export interface PlanListProps {
  /** Every plan, in the order the API sent: most recently updated first. */
  plans: readonly ListedPlan[]

  /** The instant the page was rendered, passed down so every row dates itself the same way. */
  now: number
}

/**
 * The plans index: one row each, or the empty state for a workspace that holds none yet.
 *
 * The order is the API's and is not re-sorted here. `PlanList` is declared most recently updated
 * first, and a list that sorted again would either repeat that rule or quietly disagree with it.
 */
export function PlanList({ plans, now }: PlanListProps) {
  if (plans.length === 0) return <EmptyState>No plans yet — there is nothing to open.</EmptyState>
  return (
    <div className="grid gap-2.5">
      {plans.map((plan) => (
        <PlanRow key={plan.id} now={now} plan={plan} />
      ))}
    </div>
  )
}
