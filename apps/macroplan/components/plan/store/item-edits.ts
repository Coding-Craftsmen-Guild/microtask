import type { ItemChange, ItemPlacement, NewItem } from '@repo/api-client'
import type { PlanScreenModel } from '../plan-screen-model'
import { cleanName } from './clean-name'
import { densifiedBy, placeAmong } from './edit-order'

type Item = PlanScreenModel['items'][number]

const inFeature = (item: Item): string => item.featureId

const holdsFeature = (plan: PlanScreenModel, featureId: string): boolean =>
  plan.features.some((one) => one.id === featureId)

const swap = (plan: PlanScreenModel, id: string, next: (item: Item) => Item): PlanScreenModel =>
  plan.items.some((one) => one.id === id)
    ? { ...plan, items: plan.items.map((one) => (one.id === id ? next(one) : one)) }
    : plan

/**
 * An item renamed or re-estimated — `ItemService.update`, mirrored for an optimistic edit (ADR 0069).
 *
 * As for a feature: an empty name keeps the old one, and an item the plan does not hold hands the plan
 * back untouched so that the API's refusal is the only thing that happens.
 *
 * @param plan - The plan as it stands.
 * @param id - The item.
 * @param change - The fields to set; `null` clears the estimate.
 * @returns The plan with the item changed.
 */
export function changeItem(plan: PlanScreenModel, id: string, change: ItemChange): PlanScreenModel {
  return swap(plan, id, (one) => ({
    ...one,
    name: change.name === undefined ? one.name : (cleanName(change.name) ?? one.name),
    estimateDays: change.estimateDays === undefined ? one.estimateDays : change.estimateDays,
  }))
}

/**
 * An item moved inside its feature or under another, both renumbered — `ItemService.place`.
 *
 * @param plan - The plan as it stands.
 * @param id - The item being moved.
 * @param to - The feature and the place among its items.
 * @returns The plan with the item placed, or the plan itself for a feature or item it does not hold.
 */
export function placeItem(plan: PlanScreenModel, id: string, to: ItemPlacement): PlanScreenModel {
  if (!holdsFeature(plan, to.featureId) || !plan.items.some((one) => one.id === id)) return plan
  const swapped = plan.items.map((one) => (one.id === id ? { ...one, featureId: to.featureId } : one))
  const group = swapped.filter((one) => one.featureId === to.featureId)
  const placed = new Map(placeAmong(group, id, to.position).map((one) => [one.id, one]))
  return { ...plan, items: densifiedBy(swapped.map((one) => placed.get(one.id) ?? one), inFeature) }
}

/**
 * One item removed, the rest of its feature renumbered — `ItemService.remove`.
 *
 * @param plan - The plan as it stands.
 * @param id - The item.
 * @returns The plan without it.
 */
export const removeItem = (plan: PlanScreenModel, id: string): PlanScreenModel => ({
  ...plan,
  items: densifiedBy(
    plan.items.filter((one) => one.id !== id),
    inFeature,
  ),
})

/**
 * An item created at the end of its feature, under a placeholder id — `ItemService.add`.
 *
 * Appended to the array for the reason `addFeature` is: the API appends, and the draw gesture reads the
 * last item as the new one.
 *
 * @param plan - The plan as it stands.
 * @param draft - What the create sends.
 * @param id - The placeholder id.
 * @returns The plan with the item added, or the plan itself under a feature it does not hold.
 */
export function addItem(plan: PlanScreenModel, draft: NewItem, id: string): PlanScreenModel {
  if (!holdsFeature(plan, draft.featureId)) return plan
  const created: Item = {
    id,
    featureId: draft.featureId,
    name: cleanName(draft.name) ?? draft.name,
    position: plan.items.filter((one) => one.featureId === draft.featureId).length,
    estimateDays: draft.estimateDays ?? null,
    linkedTaskId: null,
    createdAt: plan.updatedAt,
    updatedAt: plan.updatedAt,
  }
  return { ...plan, items: [...plan.items, created] }
}

/**
 * An item linked to a task in the bound project, or unlinked with `null` — `ItemService.link` / `unlink`.
 *
 * Only the field the plan carries: what the task is called and how far along it is comes from the bridge,
 * which a link write re-reads on the server (`actions/plan-write.ts`).
 *
 * @param plan - The plan as it stands.
 * @param id - The item.
 * @param taskId - The task, or `null`.
 * @returns The plan with the link set.
 */
export const linkItem = (plan: PlanScreenModel, id: string, taskId: string | null): PlanScreenModel =>
  swap(plan, id, (one) => ({ ...one, linkedTaskId: taskId }))
