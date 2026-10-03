import { flatSchedule } from '@repo/schedule'
import type { PlanScreenModel } from '../plan-screen-model'

/**
 * The plan with its schedule recomputed from its own structure.
 *
 * `flatSchedule` is the function the API answers every plan with (`planSchedule` in
 * `@repo/macroplan-domain` delegates to it), so this is not an estimate of the server's schedule but the
 * same computation run a round trip earlier. That is what lets an optimistic edit move every bar it moves
 * — the dropped feature, everything waiting on it across rails, its rail's tail — the moment it is made,
 * and lets the API's answer then change nothing on screen (ADR 0069).
 *
 * @param plan - A plan whose structure may have been edited since its schedule was computed.
 * @returns The same plan, its schedule current.
 */
export const withSchedule = (plan: PlanScreenModel): PlanScreenModel => ({ ...plan, schedule: flatSchedule(plan) })
