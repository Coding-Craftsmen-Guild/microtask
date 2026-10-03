import type { EpicChange, NewEpic } from '@repo/api-client'
import type { PlanScreenModel } from '../plan-screen-model'
import { cleanName } from './clean-name'
import { densified, placeAmong } from './edit-order'
import { withoutFeatures } from './feature-edits'

type Rail = PlanScreenModel['epics'][number]

const DEFAULT_COLOUR = '#3355ff'

const slotted = (rails: readonly Rail[]) => rails.map((rail) => ({ ...rail, position: rail.railOrder }))

const unslotted = (rails: readonly (Rail & { readonly position: number })[]): readonly Rail[] =>
  rails.map(({ position, ...rail }) => ({ ...rail, railOrder: position }))

/**
 * A rail renamed or recoloured — `EpicService.update`, mirrored for an optimistic edit (ADR 0069).
 *
 * @param plan - The plan as it stands.
 * @param id - The rail.
 * @param change - A new name, a new colour, or both.
 * @returns The plan with the rail changed.
 */
export function changeRail(plan: PlanScreenModel, id: string, change: EpicChange): PlanScreenModel {
  if (!plan.epics.some((one) => one.id === id)) return plan
  const next = (one: Rail): Rail => ({
    ...one,
    name: change.name === undefined ? one.name : (cleanName(change.name) ?? one.name),
    colour: change.colour ?? one.colour,
  })
  return { ...plan, epics: plan.epics.map((one) => (one.id === id ? next(one) : one)) }
}

/**
 * The rails with one moved to a place in their order — the domain's `placedRail`.
 *
 * The array comes back **sorted by the new order**, because the domain's does: `placeAmong` sorts, and the
 * domain writes its answer straight back. Matching that is what keeps the answered plan from reshuffling a
 * list the optimistic one had already drawn.
 *
 * @param plan - The plan as it stands.
 * @param id - The rail being moved.
 * @param railOrder - Where it should land.
 * @returns The plan with the rails renumbered.
 */
export const reorderRail = (plan: PlanScreenModel, id: string, railOrder: number): PlanScreenModel =>
  plan.epics.some((one) => one.id === id)
    ? { ...plan, epics: unslotted(placeAmong(slotted(plan.epics), id, railOrder)) }
    : plan

/**
 * A rail removed with everything on it — the domain's `withoutEpic`: its features (and so their items and
 * every edge to them) go first, then the rail, and the rest close up their order.
 *
 * @param plan - The plan as it stands.
 * @param id - The rail.
 * @returns The plan without it.
 */
export function removeRail(plan: PlanScreenModel, id: string): PlanScreenModel {
  const onRail = new Set(plan.features.filter((one) => one.epicId === id).map((one) => one.id))
  const removed = withoutFeatures(plan, onRail)
  const rest = removed.epics.filter((one) => one.id !== id)
  return { ...removed, epics: unslotted(densified(slotted(rest))) }
}

/**
 * A rail created last, unbound, under a placeholder id — `EpicService.add`, including its default colour.
 * An id the plan already holds adds nothing, for the reason `addFeature` gives.
 *
 * @param plan - The plan as it stands.
 * @param draft - What the create sends.
 * @param id - The placeholder id, or the real one once the create has been answered.
 * @returns The plan with the rail added.
 */
export function addRail(plan: PlanScreenModel, draft: NewEpic, id: string): PlanScreenModel {
  if (plan.epics.some((one) => one.id === id)) return plan
  const created: Rail = {
    id,
    name: cleanName(draft.name) ?? draft.name,
    colour: draft.colour ?? DEFAULT_COLOUR,
    railOrder: plan.epics.length,
    binding: null,
    createdAt: plan.updatedAt,
    updatedAt: plan.updatedAt,
  }
  return { ...plan, epics: [...plan.epics, created] }
}
