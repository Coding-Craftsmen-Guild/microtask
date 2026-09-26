'use server'

import type { NewLabel, Plan } from '@repo/api-client'
import { adminWrite } from './plan-write'
import type { ActionResult } from './result'

/**
 * Adds a label to the plan: a group features on any rail can be put into.
 *
 * Takes the whole {@link NewLabel} rather than a name and a colour beside it, for the reason
 * `createEpic` does: `colour` is optional on the wire, and `exactOptionalPropertyTypes` leaves "the
 * colour nobody picked" with no spelling as a positional `string | undefined`.
 */
export async function createLabel(planId: string, label: NewLabel): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.labels.create(planId, label))
}

/**
 * Renames one label.
 *
 * One field per action, as every write on this surface is: the API asks `label:rename` once for a name,
 * a colour or both, so splitting buys no authority — what it buys is that no caller has to track which
 * of an entity's fields share a gate, and that the 422 the API answers an empty body with is
 * unreachable from here. `actions/epics.ts` argues the trade at length, the cost being that a dialog
 * changing both sends two requests and a refusal of the second leaves the first written.
 */
export async function renameLabel(
  planId: string,
  labelId: string,
  name: string,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.labels.update(planId, labelId, { name }))
}

/** Recolours one label. Gated on `label:rename`, exactly as {@link renameLabel} is. */
export async function recolourLabel(
  planId: string,
  labelId: string,
  colour: string,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.labels.update(planId, labelId, { colour }))
}

/**
 * Removes one label, clearing it off every feature that was in it.
 *
 * **It removes no feature**, which is what separates it from `removeEpic`: a rail is where work lives
 * and a group is a way of seeing work that lives somewhere else. It answers the plan that remains for
 * the same reason every write here does — the features that were in the group come back ungrouped, and
 * a surface holding the old plan would go on drawing them as grouped.
 */
export async function removeLabel(planId: string, labelId: string): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.labels.remove(planId, labelId))
}

/**
 * Puts one feature in a group, or takes it out of one with `null`.
 *
 * A **feature** write and not a label one, which is why it is named for the feature: the group is a
 * field of the feature, so this is the only write here that changes what a group contains. `null` is
 * how a feature leaves a group, and there is no other way out.
 */
export async function labelFeature(
  planId: string,
  featureId: string,
  labelId: string | null,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.features.setLabel(planId, featureId, labelId))
}
