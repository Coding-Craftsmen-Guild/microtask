import type { ProjectScope, Role } from '@repo/kernel'

/** One person's access to a project or a single task. */
export interface ShareLink {
  readonly token: string
  readonly name: string
  readonly role: Role
  readonly scope: ProjectScope
  readonly createdBy: string | null
  readonly createdAt: string
}
