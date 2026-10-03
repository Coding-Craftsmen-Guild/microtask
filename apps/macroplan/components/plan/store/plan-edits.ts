import type { PlanChange } from '@repo/api-client'
import { MAX_SPRINT_LENGTH_DAYS } from '@repo/contracts'
import type { PlanScreenModel } from '../plan-screen-model'
import { cleanName } from './clean-name'

const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/

const MAX_ZONE_LENGTH = 64

const resolves = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const isDate = (value: string): boolean => ISO_DATE.test(value)

const isSprintLength = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= MAX_SPRINT_LENGTH_DAYS

const isZone = (value: string): boolean => value.length >= 1 && value.length <= MAX_ZONE_LENGTH && resolves(value)

const taken = <Value>(value: Value | undefined, holds: (value: Value) => boolean, was: Value): Value =>
  value !== undefined && holds(value) ? value : was

/**
 * A plan renamed or retimed — `PlanService.update`, mirrored for an optimistic edit (ADR 0069).
 *
 * Retiming is the one edit that moves every bar at once, since the schedule's day zero and its sprint
 * grid are these two fields; the store recomputes the schedule after every edit, so a new start date
 * redraws the whole timeline in the same frame the field is committed in.
 *
 * Which is why a value the API would refuse is not drawn. A cleared sprint length arrives as 0, and a board
 * drawn on a zero-day sprint divides every day by it until the refusal lands. Each setting is held to the
 * rule the API's payload holds it to — `IsoDate`, `PlanManifest.sprintLengthDays` and `Timezone` in
 * `@repo/contracts`, mirrored rather than imported so the screen ships no schema library for three checks,
 * and held to those schemas by its tests — and one the API would not take leaves the plan's own, the way a
 * name that cleans to nothing does. The screen shows what will still be true when the refusal comes back,
 * and the refusal says why.
 *
 * @param plan - The plan as it stands.
 * @param change - The settings to change; an absent key leaves that setting alone.
 * @returns The plan with its settings changed.
 */
export const retimePlan = (plan: PlanScreenModel, change: PlanChange): PlanScreenModel => ({
  ...plan,
  name: change.name === undefined ? plan.name : (cleanName(change.name) ?? plan.name),
  startDate: taken(change.startDate, isDate, plan.startDate),
  sprintLengthDays: taken(change.sprintLengthDays, isSprintLength, plan.sprintLengthDays),
  timezone: taken(change.timezone, isZone, plan.timezone),
})
