import type { Role } from './role.js'
import type { Scope } from './scope.js'

/** Who is making a request. A service key alone is never a principal. */
export type Principal =
  | { readonly kind: 'admin' }
  | {
      readonly kind: 'link'
      readonly role: Role
      readonly scope: Scope
      readonly token: string
    }
