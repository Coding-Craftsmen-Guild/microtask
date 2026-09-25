import {
  BoundTaskList,
  PlanView,
  type BindEpicPayload,
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
 * Where a rail sits among its siblings, counted from zero.
 *
 * `Position` is `int().min(0)` and the domain renumbers rails densely from zero, so a caller that
 * assumes a 1-based order is accepted with a 200 and draws the rail in the wrong lane.
 *
 * The payload object rather than a bare `railOrder`, even though the domain's `EpicService.place`
 * takes the number and the handler destructures it out of the body. The wire shape is `{railOrder}`
 * and this client speaks the wire; matching the domain's asymmetry would put a second spelling of
 * one route in the repository.
 */
export type EpicPlacement = Decoded<typeof EpicPlacementPayload>

/**
 * What an epic is bound to in Microtask: a share token pasted from there, and the role to hold it at.
 *
 * No `projectId`. The API derives the project by resolving the token, so the two can never disagree —
 * a caller that supplied both would be asking the API to choose which half to believe.
 */
export type NewBinding = Decoded<typeof BindEpicPayload>

/** The tasks of a rail's bound project, id and name only: what a picker chooses from. */
export type BoundTasks = Decoded<typeof BoundTaskList>

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
   * a reader: deleting a rail cascades wide enough to re-derive every span. {@link Plan} records why
   * that is what the whole subtree answers, and names the file the rule belongs to.
   */
  remove(planId: string, epicId: string): Promise<Plan>

  /**
   * Binds one rail to a Microtask project by a token pasted from there. Admin-only (`epic:bind`).
   *
   * **422** for a token that names no project, and **422** for one holding less in Microtask than the
   * role asked for — two sentences a caller acts on differently, so read the detail rather than the
   * status. Binding a rail that is already bound replaces its binding.
   */
  bind(planId: string, epicId: string, binding: NewBinding): Promise<Plan>

  /**
   * Unbinds one rail. Idempotent, and it leaves every item's link in place.
   *
   * Those links go inert rather than away: the API reports nothing for an item whose rail did not
   * resolve, so rebinding the same project brings them all back (spec §7.2 permits no delete here).
   */
  unbind(planId: string, epicId: string): Promise<Plan>

  /**
   * The tasks of one rail's bound project. Admin-only, and **409** when the rail is bound to nothing.
   *
   * Gated on `epic:bind` rather than on a read action, which is a decision and not an oversight: spec
   * §7.3 grants a seat one *linked* task's name, and a list of every task in a project is materially
   * more than that.
   */
  tasks(planId: string, epicId: string): Promise<BoundTasks>
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
    bind: (planId, epicId, binding) =>
      transport.json(
        { method: 'PUT', path: `${epicPath(planId, epicId)}/binding`, body: binding },
        PlanView,
      ),
    unbind: (planId, epicId) =>
      transport.json({ method: 'DELETE', path: `${epicPath(planId, epicId)}/binding` }, PlanView),
    tasks: (planId, epicId) =>
      transport.json(
        { method: 'GET', path: `${planPath(planId)}/bridge/epics/${encodeURIComponent(epicId)}/tasks` },
        BoundTaskList,
      ),
  }
}
