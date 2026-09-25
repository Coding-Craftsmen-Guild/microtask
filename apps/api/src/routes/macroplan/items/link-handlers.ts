import type { RouteHandler } from '@hono/zod-openapi'
import { Conflict, effectiveBridgeRole, Forbidden, Invalid, type Principal } from '@repo/kernel'
import {
  planRoleOf,
  planView,
  type EpicBinding,
  type ItemService,
  type PlanEpic,
  type PlanItem,
  type PlanManifest,
  type PlanService,
} from '@repo/macroplan-domain'
import { NotFound } from '@repo/kernel'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import type { BoundProject, BridgeService } from '../../../bridge/bridge-service.js'
import { PRODUCT } from '../product.js'
import type { createTaskForItemRoute, linkItemRoute, unlinkItemRoute } from './routes.js'

/**
 * The sentence each way a link can be refused is reported with, so no two routes word one differently.
 *
 * `unbound` covers a rail bound to nothing **and** a rail whose token no longer resolves, which are one
 * sentence from here: either way there is no bound project in which to find or create a task. Spec §7.2
 * makes that deliberate — "a revoked or dead token renders the epic unlinked", one stated state.
 */
export const LINK_REFUSALS = {
  unbound: 'That rail is bound to no live Microtask project.',
  notATask: 'That task is not one of the bound project’s.',
  alreadyLinked: 'That item is already linked to a task.',
  notManage: 'That rail is not bound at manage, so nothing may be created in its project.',
} as const

/** One item and the rail it sits under, both found in the manifest the caller already read. */
export interface ItemRail {
  readonly item: PlanItem
  readonly epic: PlanEpic
}

/**
 * Walks an item to the rail above it, or raises `NotFound` naming which hop failed to land.
 *
 * Two hops, because the three arrays are siblings rather than nested. A missing item is the ordinary
 * 404 a client acts on; a missing feature or rail is a corrupt manifest, and answering 404 for it is
 * honest — the addressed thing genuinely cannot be reached — where a 500 would blame the request.
 */
export function itemRail(manifest: PlanManifest, itemId: string): ItemRail {
  const item = manifest.items.find((each) => each.id === itemId)
  if (item === undefined) throw new NotFound('Item not found')
  const feature = manifest.features.find((each) => each.id === item.featureId)
  const epic = manifest.epics.find((each) => each.id === feature?.epicId)
  if (epic === undefined) throw new NotFound('Item not found')
  return { item, epic }
}

/**
 * The rail's live binding, or a 409 — the one place the two unbound causes become one answer.
 *
 * Returns the stored `EpicBinding` beside the resolved one, because the writer needs the sealed blob
 * and the reader needs the attenuated role, and pairing them here means no caller has to re-derive
 * either or convince the compiler that a `'bound'` state implies a non-null `binding`.
 */
export async function liveBinding(
  bridge: BridgeService,
  epic: PlanEpic,
): Promise<{ readonly stored: EpicBinding; readonly live: Extract<BoundProject, { state: 'bound' }> }> {
  const found = (await bridge.read([epic])).get(epic.id)
  if (epic.binding === null || found === undefined || found.state !== 'bound') {
    throw new Conflict(LINK_REFUSALS.unbound)
  }
  return { stored: epic.binding, live: found }
}

/**
 * Links one item to a task that already exists in its rail's bound project.
 *
 * `item:link` is a `write` grant, so a write seat reaches this. It creates nothing: the task must be
 * one the bound project already holds, which is checked against the very map the bridge read — so a
 * task deleted in Microtask between the read and now is refused rather than stored as a dangling id.
 */
export const linkItem =
  (items: ItemService, plans: PlanService, bridge: BridgeService): RouteHandler<typeof linkItemRoute, ApiEnv> =>
  async (c) => {
    const { planId, itemId } = c.req.valid('param')
    const { taskId } = c.req.valid('json')
    const principal = authorize(c, 'item:link', { kind: 'item', planId })
    const manifest = await plans.read({ product: PRODUCT, planId })
    const { epic } = itemRail(manifest, itemId)
    const { live } = await liveBinding(bridge, epic)
    if (!live.tasks.has(taskId)) throw new Invalid(LINK_REFUSALS.notATask)
    const updated = await items.link({ product: PRODUCT, planId }, itemId, taskId)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Unlinks one item and answers the plan. Asks nothing of Microtask.
 *
 * Deliberately no binding check: an item linked while its rail was bound must be unlinkable after the
 * rail is unbound or its token dies, and requiring a live binding to clear a field would strand exactly
 * the links somebody most wants to clear.
 */
export const unlinkItem =
  (items: ItemService): RouteHandler<typeof unlinkItemRoute, ApiEnv> =>
  async (c) => {
    const { planId, itemId } = c.req.valid('param')
    const principal = authorize(c, 'item:link', { kind: 'item', planId })
    const updated = await items.unlink({ product: PRODUCT, planId }, itemId)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Creates the real task in the bound project, named after the item, and links the item to it.
 *
 * ### The order, and the orphan it accepts
 *
 * The task is created **first**, then the link is written. If the second write fails, a named task
 * exists in Microtask with nothing pointing at it. There is no compensating delete because spec §7.2
 * permits this bridge none — "no delete, no rename of anything Macroplan did not create" — so the
 * orphan is structural rather than an oversight, and it is visible to a human as a task with a name.
 * The other order would be worse: an item linked to a task that was never created is a dangling id,
 * and a retry would then create a second task for one item.
 *
 * The two writes are **sequenced and never nested**. `Lock` is not reentrant — `QueueLock.run` chains
 * onto a promise that only settles when the outer work finishes — so a create inside the item write
 * would deadlock rather than fail.
 *
 * ### Why already-linked is a conflict
 *
 * A retry of a request whose response was lost must not create a second task. There is no idempotency
 * key here, so the item's own link is the record that the work happened.
 */
export const createTaskForItem =
  (
    items: ItemService,
    plans: PlanService,
    bridge: BridgeService,
  ): RouteHandler<typeof createTaskForItemRoute, ApiEnv> =>
  async (c) => {
    const { planId, itemId } = c.req.valid('param')
    const principal = authorize(c, 'item:link', { kind: 'item', planId })
    const manifest = await plans.read({ product: PRODUCT, planId })
    const { item, epic } = itemRail(manifest, itemId)
    if (item.linkedTaskId !== null) throw new Conflict(LINK_REFUSALS.alreadyLinked)
    const { stored, live } = await liveBinding(bridge, epic)
    assertManages(principal, live)
    const taskId = await bridge.createTask(stored, item.name)
    if (taskId === null) throw new Forbidden(LINK_REFUSALS.notManage)
    const updated = await items.link({ product: PRODUCT, planId }, itemId, taskId)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Refuses unless the **effective** role on this rail is `manage` (spec §7.3, the minimum's second
 * application).
 *
 * The sentence names the rail and not the caller, because the caller's own role may be perfectly
 * adequate: a plan `manage` holder over a rail bound at `view` is refused by the binding's ceiling, and
 * telling them they lack permission would send them looking in the wrong place.
 */
export function assertManages(principal: Principal, live: Extract<BoundProject, { state: 'bound' }>): void {
  if (effectiveBridgeRole(planRoleOf(principal), live.role) !== 'manage') {
    throw new Forbidden(LINK_REFUSALS.notManage)
  }
}
