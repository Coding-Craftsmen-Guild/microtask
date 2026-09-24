import {
  PlanView,
  type CreateEpicPayload,
  type EpicPlacementPayload,
  type UpdateEpicPayload,
} from '@repo/contracts'
import { planPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'
import type { Plan } from './plans.js'

const epicsPath = (planId: string): string => `${planPath(planId)}/epics`

const epicPath = (planId: string, epicId: string): string =>
  `${epicsPath(planId)}/${encodeURIComponent(epicId)}`

/** The rail to add: its name, and optionally the hue it is drawn in. */
export type NewEpic = Decoded<typeof CreateEpicPayload>

/**
 * What may be changed about a rail that already exists: its name, its colour, or both.
 *
 * Not its binding. `UpdateEpicPayload` declares no such field, so a body naming one has it stripped
 * by the API rather than honoured: what an epic is bound to in Microtask is the ceiling on what a
 * seat holder reaches through the bridge, and phase 4 is what writes it.
 */
export type EpicChange = Decoded<typeof UpdateEpicPayload>

/**
 * Where a rail sits among its siblings.
 *
 * The payload object rather than a bare `railOrder`, even though the domain's `EpicService.place`
 * takes the number and the handler destructures it out of the body. The wire shape is `{railOrder}`
 * and this client speaks the wire; matching the domain's asymmetry would put a second spelling of
 * one route in the repository.
 */
export type EpicPlacement = Decoded<typeof EpicPlacementPayload>

/** Everything a caller may ask of a plan's rails. */
export interface EpicsApi {
  /** Adds a rail at the bottom of the plan; the body carries no placement, only a name and a hue. */
  create(planId: string, epic: NewEpic): Promise<Plan>

  /**
   * Renames one rail, recolours it, or both, moving nothing on it.
   *
   * The API refuses an empty body, so a call asking for nothing is a 422 rather than a write that
   * stamps `updatedAt` and changes nothing.
   */
  update(planId: string, epicId: string, change: EpicChange): Promise<Plan>

  /**
   * Moves one rail to a rail order, renumbering the rails densely.
   *
   * Its own path segment rather than a key on {@link EpicsApi.update}, because the API gates it as
   * its own action: `epic:reorder` against `epic:rename`. Both sit at `manage`, so this is a
   * separate gate rather than a higher bar — a `write` seat is refused either. The features on every
   * rail keep the positions they had, so the spans in the response move only if a rail's contents
   * did.
   */
  place(planId: string, epicId: string, to: EpicPlacement): Promise<Plan>

  /**
   * Removes one rail, the features on it and the items under those, in one write.
   *
   * It answers the **plan that remains** and not `void`, which is the one thing here that surprises
   * a reader: deleting a rail cascades wide enough to re-derive every span, so the route answers 200
   * with the whole plan rather than 204. `plan-response.ts` names the three routes under a plan that
   * do answer something else — `POST /plans`, `DELETE /plans/{planId}` and a share-link revoke — and
   * an epic delete is not one of them. The obvious `Promise<void>` would typecheck against nothing.
   */
  remove(planId: string, epicId: string): Promise<Plan>
}

/** Binds the rail operations to a transport. */
export function epicsApi(transport: Transport): EpicsApi {
  return {
    create: (planId, epic) =>
      transport.json({ method: 'POST', path: epicsPath(planId), body: epic }, PlanView),
    update: (planId, epicId, change) =>
      transport.json({ method: 'PATCH', path: epicPath(planId, epicId), body: change }, PlanView),
    place: (planId, epicId, to) =>
      transport.json(
        { method: 'PATCH', path: `${epicPath(planId, epicId)}/placement`, body: to },
        PlanView,
      ),
    remove: (planId, epicId) =>
      transport.json({ method: 'DELETE', path: epicPath(planId, epicId) }, PlanView),
  }
}
