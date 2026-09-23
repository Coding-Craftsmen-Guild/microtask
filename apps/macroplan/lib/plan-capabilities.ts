import { capabilities, mayReach, type RoleValue, type ScopeValue } from '@repo/contracts'

/** What a plan seat may do about seats, one boolean per question a share manager asks. */
export interface PlanControls {
  /** Whether this seat is told the plan's other seats at all. */
  readonly read: boolean

  /** Whether it may mint one, which is decided against its own scope rather than the plan. */
  readonly create: boolean

  /** Whether it may rename or re-role one. */
  readonly update: boolean

  /** Whether it may revoke one. */
  readonly revoke: boolean
}

/**
 * What a plan seat may do, with the three seat actions asked the way they have to be asked.
 *
 * `capabilities()` answers each action against its own `target`, and the three `share:*` rows name
 * `'project'` because one `GRANTS` row serves both products — the share system's action, gated on
 * the container whose seats it administers, which is a project in Microtask and a plan here
 * (`ACTION_DECISIONS`, and `alsoGatedOn: ['plan']` on each of the three). A plan scope reaches no
 * `project` target at all, so reading those three off the record answers `false` for a `manage`
 * seat the server would serve. `mayReach(role, scope, action, 'plan')` is the question that matches
 * the server, and ADR 0053 records why the row is shaped that way. Phase 2 draws none of these; it
 * fixes the shape so phase 3's share manager cannot be wired from the record by accident.
 *
 * `share:create` is read off the record **on purpose**, and it is the one of the four that may be:
 * its target is `'own-scope'`, which every scope reaches by definition, so the record and a
 * `mayReach` call cannot disagree about it. A fourth `mayReach` would read as though it were
 * guarding against the same thing as the other three, and hide that the record is only wrong about
 * an action whose target names a container.
 *
 * It answers a rendering question and never a gate: a seat downgraded between render and click
 * still meets the API's own 403 (ADR 0038, ADR 0009). It is asked with the scope the seat holds —
 * `PlanShareView.scope` — because a {@link ScopeValue} carries the id the kernel compares, and
 * reusing one plan's answers for another plan's controls would draw controls the API refuses.
 */
export function planCapabilities(role: RoleValue, scope: ScopeValue): PlanControls {
  const can = capabilities(role, scope)
  return {
    read: mayReach(role, scope, 'share:read', 'plan'),
    create: can['share:create'],
    update: mayReach(role, scope, 'share:update', 'plan'),
    revoke: mayReach(role, scope, 'share:revoke', 'plan'),
  }
}
