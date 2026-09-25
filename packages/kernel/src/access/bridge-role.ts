import { ROLES, type Role } from './role.js'

/**
 * The weaker of two roles, at the one seam where a Macroplan plan role and a Microtask bridge role
 * meet (design §7.3): a link holder's own role over the plan, and the role an epic's binding
 * carries into the bound project.
 *
 * "Weaker" is read off `ROLES`' own position rather than a second ordering declared here — a
 * ranking that lived beside this function instead of inside `role.ts` would agree with it by
 * coincidence today and drift the day one file gained a role the other did not.
 *
 * Later callers apply this twice: once to attenuate a binding's declared role by the token's live
 * role in Microtask, and once more to attenuate that result by the plan reader's own role. Taking
 * the minimum is commutative, idempotent and associative, so those two applications agree with a
 * single three-way minimum however they are grouped or in whatever order the two facts become
 * known — which is the property phase 4's later tasks depend on and the reason this function is
 * exercised for it here rather than there.
 */
export function effectiveBridgeRole(left: Role, right: Role): Role {
  return ROLES.indexOf(left) <= ROLES.indexOf(right) ? left : right
}
