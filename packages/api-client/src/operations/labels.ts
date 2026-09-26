import { PlanView, type CreateLabelPayload, type UpdateLabelPayload } from '@repo/contracts'
import { planPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'
import type { Plan } from './plans.js'

const labelsPath = (planId: string): string => `${planPath(planId)}/labels`

const labelPath = (planId: string, labelId: string): string =>
  `${labelsPath(planId)}/${encodeURIComponent(labelId)}`

/** The label to add: its name, and optionally the colour its chip is drawn in. */
export type NewLabel = Decoded<typeof CreateLabelPayload>

/**
 * What may be changed about a label that already exists: its name, its colour, or both.
 *
 * Not which features are in it. A group's membership is a field of each **feature**, so putting one in
 * a group is `features.setLabel` — and that asymmetry is the whole reason renaming a phase is one write
 * rather than one per feature in it.
 */
export type LabelChange = Decoded<typeof UpdateLabelPayload>

/**
 * Everything a caller may ask of a plan's labels: the groups its features are put into, across rails.
 *
 * Every member is `manage`-only, so a 403 for a `write` seat is an ordinary outcome here rather than a
 * misconfiguration: deciding which release a feature belongs to is shaping the plan rather than doing
 * the work in it, and `packages/kernel/src/access/policy.ts` holds the grants.
 *
 * There is **no `place`**. Labels are ordered by the ids they were created with — a ULID opens with its
 * creation millisecond — so there is nothing to move and the API serves no such route.
 */
export interface LabelsApi {
  /** Adds a label to the plan, holding no features yet. Answers the whole plan. */
  create(planId: string, label: NewLabel): Promise<Plan>

  /**
   * Renames one label, recolours it, or both. Moves no feature.
   *
   * The API refuses an empty body, so a call asking for nothing is a 422 rather than a write that
   * stamps `updatedAt` and changes nothing — which a plan list is ordered by.
   */
  update(planId: string, labelId: string, change: LabelChange): Promise<Plan>

  /**
   * Removes one label and clears it off every feature that was in it, in one write.
   *
   * **It deletes no feature**, which is the one thing here a reader of {@link EpicsApi.remove} would
   * guess wrongly: a rail is where work lives, so removing one removes the work, and a group is a way
   * of seeing work that lives somewhere else. Every feature keeps its rail, its estimate, its pin, its
   * edges and its items, and comes back in no group. So the plan it answers has the spans it had.
   */
  remove(planId: string, labelId: string): Promise<Plan>
}

/** Binds the label operations to a transport. */
export function labelsApi(transport: Transport): LabelsApi {
  return {
    create: (planId, label) =>
      transport.json({ method: 'POST', path: labelsPath(planId), body: label }, PlanView),
    update: (planId, labelId, change) =>
      transport.json({ method: 'PATCH', path: labelPath(planId, labelId), body: change }, PlanView),
    remove: (planId, labelId) =>
      transport.json({ method: 'DELETE', path: labelPath(planId, labelId) }, PlanView),
  }
}
