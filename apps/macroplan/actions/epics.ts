'use server'

import type { NewEpic, Plan } from '@repo/api-client'
import { adminWrite } from './plan-write'
import type { ActionResult } from './result'

/**
 * Adds a rail at the bottom of the plan, and answers the plan with it on.
 *
 * Takes the whole {@link NewEpic} rather than a name and a colour beside it, because `colour` is
 * optional on the wire and `exactOptionalPropertyTypes` leaves "the colour nobody picked" with no
 * spelling as a positional `string | undefined`: the caller would build the body anyway, with one
 * conditional spread per call site.
 */
export async function createEpic(planId: string, epic: NewEpic): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.epics.create(planId, epic))
}

/**
 * Renames one rail.
 *
 * Its own action rather than a `name` key on one `updateEpic` taking a partial — and the API does
 * **not** require that. `PATCH .../epics/{epicId}` asks `epic:rename` once for a body carrying a
 * name, a colour or both (`apps/api/src/routes/macroplan/epics/handlers.ts`), so colour rides on
 * rename and splitting buys no authority the merged form lacks. Two other things buy it. Every write
 * on this surface then carries exactly one field, so no caller has to keep track of which of an
 * entity's fields happen to share a gate — which for features is a question with a different answer.
 * And a required value per action makes the 422 the API answers an empty `UpdateEpicPayload` with
 * unreachable, rather than a refusal a caller is able to produce.
 *
 * The cost is real and is the reason the same choice is not automatic elsewhere: a dialog changing a
 * name and a colour together sends two requests, and a refusal of the second leaves the first
 * written, which one merged request could not do. Both answer the whole plan, so what the caller
 * renders is what the server holds either way.
 */
export async function renameEpic(
  planId: string,
  epicId: string,
  name: string,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.epics.update(planId, epicId, { name }))
}

/**
 * Recolours one rail.
 *
 * Gated on `epic:rename`, exactly as {@link renameEpic} is, whose TSDoc holds the reason these are
 * two actions rather than one partial.
 */
export async function recolourEpic(
  planId: string,
  epicId: string,
  colour: string,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.epics.update(planId, epicId, { colour }))
}

/**
 * Moves one rail among its siblings, renumbering them densely from zero.
 *
 * Named for the authority it needs rather than for the client method it calls (`epics.place`), as
 * every action in this directory is: `epic:reorder` is a grant of its own beside `epic:rename`, so
 * the name of the action is the name of the gate it has to meet.
 */
export async function reorderEpic(
  planId: string,
  epicId: string,
  railOrder: number,
): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.epics.place(planId, epicId, { railOrder }))
}

/**
 * Removes one rail, the features on it and the items under those.
 *
 * It answers the plan that remains and not nothing, like every write here: a feature on another rail
 * that waited on one of these no longer waits on anything, and the forward pass moves its bar.
 */
export async function removeEpic(planId: string, epicId: string): Promise<ActionResult<Plan>> {
  return adminWrite(planId, (api) => api.epics.remove(planId, epicId))
}
