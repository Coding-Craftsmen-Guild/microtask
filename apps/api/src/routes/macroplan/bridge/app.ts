import { OpenAPIHono } from '@hono/zod-openapi'
import type { PlanService } from '@repo/macroplan-domain'
import type { ApiEnv } from '../../../auth/env.js'
import type { BridgeService } from '../../../bridge/bridge-service.js'
import { readBoundTasks, readBridge } from './handlers.js'
import { readBoundTasksRoute, readBridgeRoute } from './routes.js'

/**
 * Everything this plan's bridge answers, mounted under `/bridge`.
 *
 * A subtree of its own rather than two routes hung beside the plan's, because both are reads *about the
 * bridge* rather than about the plan — and because putting the task list here keeps `createEpics` at two
 * collaborators instead of four, which is ADR 0027's parameter cap.
 *
 * Populated in full before its parent mounts it: a route added to a child after the parent has served is
 * silently unreachable and absent from the document besides. It carries no guard of its own — the two at
 * `createMacroplan` run for every path beneath them — and each handler still calls `authorize`.
 */
export function createBridge(plans: PlanService, bridge: BridgeService): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.openapi(readBridgeRoute, readBridge(plans, bridge))
  app.openapi(readBoundTasksRoute, readBoundTasks(plans, bridge))
  return app
}
