import { ItemView, PlanList, PlanView } from '@repo/contracts'
import { MACROPLAN_PLANS_PATH, planItemPath, planPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'

/** One plan and the schedule derived from it, with blocks this caller is refused absent. */
export type Plan = Decoded<typeof PlanView>

/** Every read a plan needs. Which of them succeed is the API's decision. */
export interface PlansApi {
  /** Lists every plan the caller may be told about. `workspace:list-plans` is admin-only. */
  list(): Promise<Decoded<typeof PlanList>>

  /** Reads one plan: its rails, its features, its items, and the schedule derived from all three. */
  read(planId: string): Promise<Plan>

  /** Reads one item with the description its own file holds. */
  readItem(planId: string, itemId: string): Promise<Decoded<typeof ItemView>>
}

/** Binds the plan operations to a transport. */
export function plansApi(transport: Transport): PlansApi {
  return {
    list: () => transport.json({ method: 'GET', path: MACROPLAN_PLANS_PATH }, PlanList),
    read: (planId) => transport.json({ method: 'GET', path: planPath(planId) }, PlanView),
    readItem: (planId, itemId) =>
      transport.json({ method: 'GET', path: planItemPath(planId, itemId) }, ItemView),
  }
}
