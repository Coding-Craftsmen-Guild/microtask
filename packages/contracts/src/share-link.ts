import { z } from 'zod'
import { EntityId, EntityName, ShareToken } from './document.js'

/** The authority a share link carries. */
export const Role = z
  .enum(['view', 'write', 'manage'])
  .meta({ id: 'Role', description: 'The authority a share link carries' })

/** What a share link may reach. */
export const Scope = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('project'), projectId: EntityId }),
    z.object({ kind: z.literal('task'), projectId: EntityId, taskId: EntityId }),
    z.object({ kind: z.literal('plan'), planId: EntityId }),
  ])
  .meta({ id: 'Scope', description: 'What a share link may reach' })

/**
 * A {@link Scope} rooted at a Microtask project — the project itself, or one task inside it.
 *
 * Microtask's own share links are minted, stored and rendered through this narrower schema, never
 * through {@link Scope} directly: a project's manifest is parsed from a bundle a caller uploads,
 * and a plan-shaped scope arriving inside it is not a wider grant to reject at authorization time,
 * it is data the schema itself should never have accepted (ADR 0038's product ids are drawn from
 * separate sequences and may collide).
 */
export const ProjectScope = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('project'), projectId: EntityId }),
    z.object({ kind: z.literal('task'), projectId: EntityId, taskId: EntityId }),
  ])
  .meta({ id: 'ProjectScope', description: 'What a Microtask share link may reach' })

/**
 * A {@link Scope} rooted at a Macroplan plan, which is the whole plan and never part of one.
 *
 * The symmetric half of {@link ProjectScope}, and narrow for the same reason: a plan's links are
 * stored in its own manifest, and a project-shaped scope arriving there would be data the schema
 * should never have accepted. A plan has exactly one shareable scope — spec §7.1 defers epic scope
 * rather than foreclosing it, and because this is a discriminated union, adding that variant later
 * invalidates no token already issued.
 */
export const PlanScope = z
  .discriminatedUnion('kind', [z.object({ kind: z.literal('plan'), planId: EntityId })])
  .meta({ id: 'PlanScope', description: 'What a Macroplan share link may reach' })

const seat = {
  token: ShareToken,
  name: EntityName.or(z.literal('')),
  role: Role,
  createdBy: ShareToken.nullable(),
  createdAt: z.string(),
} as const

/** One person's access to a project or a single task. */
export const ShareLink = z
  .object({ ...seat, scope: ProjectScope })
  .meta({ id: 'ShareLink', description: 'One person’s access, and who granted it' })

/**
 * One person's access to a plan.
 *
 * Every field of {@link ShareLink} but the scope, because a seat is a seat: the same token shape,
 * the same three roles, the same `createdBy` chain that makes revocation cascade (ADR 0010). Only
 * what it reaches differs, so only that is restated — the rest is shared rather than copied, which
 * is what stops the two drifting into two different notions of a seat.
 */
export const PlanShareLink = z
  .object({ ...seat, scope: PlanScope })
  .meta({ id: 'PlanShareLink', description: 'One person’s access to a plan, and who granted it' })

/**
 * What a caller sends to mint a share link.
 *
 * `scope` and `taskId` are both optional and mean different things: an explicit `scope` says
 * exactly what the link reaches, while `taskId` alone is the shorthand for the task it names.
 * Omitting both is refused rather than defaulted to the project, because a project spans clients
 * and the wider scope is the one that has to be asked for by name (ADR 0011).
 *
 * There is no `createdBy`. The API takes it from the credential that presented the request, so a
 * link cannot claim a parent it was not minted through — which is what keeps the revocation
 * cascade honest (ADR 0010). A client that sends one has it stripped.
 */
export const CreateShareLinkPayload = z
  .object({
    name: EntityName,
    role: Role,
    scope: ProjectScope.optional(),
    taskId: EntityId.optional(),
  })
  .meta({ id: 'CreateShareLinkPayload', description: 'A seat to mint: who for, what authority, and over what' })

/**
 * What a caller sends to rename a share link or change its role (ADR 0035).
 *
 * Closed to those two fields, and that is the decision rather than a convenience: `scope` decides
 * *what* a link reaches and a project scope can expose one client's work to another, so it stays
 * immutable and changing it is revoke-and-reissue (ADR 0011). A client that sends `scope`,
 * `taskId` or `token` has it stripped.
 *
 * The name accepts `''` where {@link CreateShareLinkPayload} does not. Production data already
 * holds a link with no name — the app being replaced rendered it as "Unnamed link" — so a rename
 * that refused it could not save a link it had just loaded. Minting still requires one.
 *
 * Both members are optional, so a body asking for nothing is well-formed and changes nothing.
 * There is no "at least one" refinement: the alternative is a 422 for a request whose only fault
 * is that it was pointless.
 */
export const UpdateShareLinkPayload = z
  .object({ name: EntityName.or(z.literal('')).optional(), role: Role.optional() })
  .meta({ id: 'UpdateShareLinkPayload', description: 'A new name, a new role, or both' })
