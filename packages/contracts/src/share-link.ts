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
  ])
  .meta({ id: 'Scope', description: 'What a share link may reach' })

/** One person's access to a project or a single task. */
export const ShareLink = z
  .object({
    token: ShareToken,
    name: EntityName.or(z.literal('')),
    role: Role,
    scope: Scope,
    createdBy: ShareToken.nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'ShareLink', description: 'One person’s access, and who granted it' })

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
    scope: Scope.optional(),
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
