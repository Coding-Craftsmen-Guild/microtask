import type { Role } from '../access/role.js'
import type { Scope } from '../access/scope.js'

/** One person's access to a project or a single task. */
export interface ShareLink {
  readonly token: string
  readonly name: string
  readonly role: Role
  readonly scope: Scope
  readonly createdBy: string | null
  readonly createdAt: string
}
