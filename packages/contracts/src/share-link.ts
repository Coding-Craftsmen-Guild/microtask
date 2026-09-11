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
