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
