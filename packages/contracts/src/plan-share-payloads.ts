import { z } from 'zod'
import { EntityName } from './document.js'
import { Role } from './share-link.js'

/**
 * What a caller sends to mint a share link on a plan.
 *
 * It has a file to itself, and this is that file's whole side of the payload seam: a seat on a plan
 * is neither a plan's own settings (`plan-payloads.ts`) nor rail structure (`structure-payloads.ts`),
 * and the plan gives share links a service (Task 14b) and a route subtree (Task 16b) of their own.
 *
 * No `scope` and no `planId`: a plan has exactly one shareable scope, the whole plan (spec §7.1
 * defers epic scope rather than foreclosing it), and the plan is already named by the route's
 * path. Microtask's own `CreateShareLinkPayload` must be given `scope` or `taskId` because a
 * project scope can span clients and the wider grant has to be asked for by name (ADR 0011) — a
 * Macroplan plan has no second client for its scope to span, so there is no choice for a caller to
 * make, and a `scope` field here would only be a second place to restate what the path already
 * says, free to disagree with it.
 *
 * There is no `UpdatePlanShareLinkPayload` either: Microtask's `UpdateShareLinkPayload` is already
 * closed to `{ name, role }` with no `scope` to freeze, so a plan link is renamed or reassigned a
 * role through that same schema, not a duplicate of it.
 */
export const CreatePlanShareLinkPayload = z
  .object({ name: EntityName, role: Role })
  .meta({ id: 'CreatePlanShareLinkPayload', description: 'A seat to mint on a plan: who for, what authority' })
