import type { RouteHandler } from '@hono/zod-openapi'
import { Conflict, NotFound } from '@repo/kernel'
import type { PlanService } from '@repo/macroplan-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import type { BridgeService } from '../../../bridge/bridge-service.js'
import { bridgeView } from '../../../bridge/bridge-view.js'
import { LINK_REFUSALS } from '../items/link-handlers.js'
import { PRODUCT } from '../product.js'
import type { readBoundTasksRoute, readBridgeRoute } from './routes.js'

/**
 * Answers this plan's bridge facts, shaped for whoever asked.
 *
 * The plan is read once and every rail goes to the bridge in **one** call, so two rails bound to the
 * same project cost one manifest read in the other product rather than two. Passing the rails as a
 * batch rather than looping is what makes that deduplication possible at all.
 *
 * Nothing here decides what a caller may see. `bridgeView` does, and it is handed the principal for
 * that reason; the gate above it only decides whether this plan may be read at all.
 */
export const readBridge =
  (plans: PlanService, bridge: BridgeService): RouteHandler<typeof readBridgeRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const principal = authorize(c, 'plan:read', { kind: 'plan', planId })
    const manifest = await plans.read({ product: PRODUCT, planId })
    const bound = await bridge.read(manifest.epics)
    return c.json(bridgeView({ ...manifest, planId: manifest.id }, bound, principal), 200)
  }

/**
 * Answers the tasks of one rail's bound project, id and name only.
 *
 * Gated on `epic:bind` — admin-only — for the reason the route's own TSDoc argues: a list of every task
 * name in a Microtask project is more than spec §7.3 grants any seat.
 *
 * Ordered by the project's own task order rather than by name, so the list reads the way it reads in
 * Microtask and a picker does not silently reorder somebody's project.
 */
export const readBoundTasks =
  (plans: PlanService, bridge: BridgeService): RouteHandler<typeof readBoundTasksRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    authorize(c, 'epic:bind', { kind: 'epic', planId })
    const manifest = await plans.read({ product: PRODUCT, planId })
    const epic = manifest.epics.find((each) => each.id === epicId)
    if (epic === undefined) throw new NotFound('Rail not found')
    const found = (await bridge.read([epic])).get(epicId)
    if (found === undefined || found.state !== 'bound') throw new Conflict(LINK_REFUSALS.unbound)
    const tasks = [...found.tasks].map(([id, facts]) => ({ id, name: facts.name }))
    return c.json({ tasks }, 200)
  }
