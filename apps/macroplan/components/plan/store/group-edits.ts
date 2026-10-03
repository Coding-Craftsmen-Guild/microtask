import type { LabelChange, NewLabel } from '@repo/api-client'
import type { PlanScreenModel } from '../plan-screen-model'
import { cleanName } from './clean-name'

type Group = PlanScreenModel['labels'][number]

const DEFAULT_COLOUR = '#7c3aed'

/**
 * A group renamed or recoloured — `LabelService.update`, mirrored for an optimistic edit (ADR 0069).
 *
 * @param plan - The plan as it stands.
 * @param id - The group.
 * @param change - A new name, a new colour, or both.
 * @returns The plan with the group changed.
 */
export function changeGroup(plan: PlanScreenModel, id: string, change: LabelChange): PlanScreenModel {
  if (!plan.labels.some((one) => one.id === id)) return plan
  const next = (one: Group): Group => ({
    ...one,
    name: change.name === undefined ? one.name : (cleanName(change.name) ?? one.name),
    colour: change.colour ?? one.colour,
  })
  return { ...plan, labels: plan.labels.map((one) => (one.id === id ? next(one) : one)) }
}

/**
 * A group removed, and every feature that was in it released to no group — `LabelService.remove`.
 *
 * @param plan - The plan as it stands.
 * @param id - The group.
 * @returns The plan without it.
 */
export const removeGroup = (plan: PlanScreenModel, id: string): PlanScreenModel => ({
  ...plan,
  labels: plan.labels.filter((one) => one.id !== id),
  features: plan.features.map((one) => (one.labelId === id ? { ...one, labelId: null } : one)),
})

/**
 * A group created last, under a placeholder id — `LabelService.add`, including its default colour.
 *
 * @param plan - The plan as it stands.
 * @param draft - What the create sends.
 * @param id - The placeholder id.
 * @returns The plan with the group added.
 */
export const addGroup = (plan: PlanScreenModel, draft: NewLabel, id: string): PlanScreenModel => ({
  ...plan,
  labels: [
    ...plan.labels,
    {
      id,
      name: cleanName(draft.name) ?? draft.name,
      colour: draft.colour ?? DEFAULT_COLOUR,
      createdAt: plan.updatedAt,
      updatedAt: plan.updatedAt,
    },
  ],
})
