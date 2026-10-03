import { useSyncExternalStore, type ReactNode } from 'react'
import type { PlanEditActions } from '../edit-actions'
import type { PlanScreenModel } from '../plan-screen-model'
import { optimisticActions } from '../store/optimistic-actions'
import { createPlanStore, type PlanStore } from '../store/plan-store'
import { stubActions } from './plan-writes'

/** Props for {@link LivePlan}. */
export interface LivePlanProps {
  readonly store: PlanStore

  /** What to draw from the plan the store holds now. */
  readonly draw: (plan: PlanScreenModel) => ReactNode
}

/**
 * Draws from a real store's snapshot, and again on every change to it — which is how the screen draws a
 * field (ADR 0069).
 *
 * A field is a function of the plan it is handed and reads nothing back from an answer, so what it shows
 * once a write has been answered is whatever the store holds by then: the edit at once, the answer once
 * it lands, and the plan as it was when the write is refused. A test that renders a field alone can see
 * none of that, which is what this is for.
 */
export function LivePlan({ store, draw }: LivePlanProps) {
  const { plan } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return draw(plan)
}

/**
 * A real store over `plan`, and the optimistic writes the screen would hand a field, each sending through
 * the raw double of its name.
 *
 * @param plan - The plan the store starts from.
 * @param raw - The raw writes this test is about, by name; the rest answer the Atlas fixture.
 * @returns The store, for {@link LivePlan}, and the writes to hand the field.
 */
export const livePlan = (plan: PlanScreenModel, raw: Partial<PlanEditActions> = {}) => {
  const store = createPlanStore(plan)
  return { store, actions: optimisticActions(stubActions(raw), store) }
}
