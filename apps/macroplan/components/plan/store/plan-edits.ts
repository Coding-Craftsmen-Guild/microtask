import type { PlanChange } from '@repo/api-client'
import type { PlanScreenModel } from '../plan-screen-model'
import { cleanName } from './clean-name'

/**
 * A plan renamed or retimed — `PlanService.update`, mirrored for an optimistic edit (ADR 0069).
 *
 * Retiming is the one edit that moves every bar at once, since the schedule's day zero and its sprint
 * grid are these two fields; the store recomputes the schedule after every edit, so a new start date
 * redraws the whole timeline in the same frame the field is committed in.
 *
 * @param plan - The plan as it stands.
 * @param change - The settings to change; an absent key leaves that setting alone.
 * @returns The plan with its settings changed.
 */
export const retimePlan = (plan: PlanScreenModel, change: PlanChange): PlanScreenModel => ({
  ...plan,
  name: change.name === undefined ? plan.name : (cleanName(change.name) ?? plan.name),
  startDate: change.startDate ?? plan.startDate,
  sprintLengthDays: change.sprintLengthDays ?? plan.sprintLengthDays,
  timezone: change.timezone ?? plan.timezone,
})
