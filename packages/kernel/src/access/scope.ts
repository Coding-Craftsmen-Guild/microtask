/**
 * What a share link may reach.
 *
 * One variant per product root. A `plan` scope carries a plan id and nothing else, so it can
 * never be compared against a project id: the two products' ids are drawn from separate ULID
 * sequences and may collide, and a scope that named both would make a collision a grant.
 */
export type Scope =
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }
  | { readonly kind: 'plan'; readonly planId: string }

/**
 * A scope rooted at a Microtask project — the project itself, or one task inside it.
 *
 * {@link Scope} is the union of everything a link can reach across both products, because
 * `Principal` and `can()` genuinely decide over all of it. A Microtask consumer means less than
 * that: every one of them reads `projectId`, and the union stopped promising that field the day a
 * plan became shareable. Named here once so those consumers say which root they mean in their own
 * signatures, rather than repeating `Extract<…>` inline or asserting the union away at each site —
 * and so that adding a third product widens `Scope` without silently widening what they accept.
 */
export type ProjectScope = Extract<Scope, { kind: 'project' | 'task' }>

/**
 * A scope rooted at a Macroplan plan.
 *
 * The symmetric half of {@link ProjectScope}: the narrowing is the pair, and a half-written pair is
 * what makes the next author reach for the inline `Extract` these two exist to replace. A plan
 * scope carries a plan id and no project id, which is the whole reason the Microtask half had to be
 * named at all.
 */
export type PlanScope = Extract<Scope, { kind: 'plan' }>

/**
 * Narrows a scope to one rooted at a Microtask project.
 *
 * The runtime half of {@link ProjectScope}, beside the type rather than re-derived at each call
 * site. Without it a consumer that has a {@link Scope} and needs the narrower type has only a cast
 * available, and a cast in an authorization path asserts what nothing checked — which is exactly
 * what `apps/api` was doing while `PrincipalResolver` could only ever produce a project scope.
 *
 * It enumerates the kinds it admits rather than excluding `'plan'`, so a third product's variant
 * added to {@link Scope} is refused here until someone decides it belongs — the opposite direction
 * from a `!== 'plan'` test, which would silently admit it.
 */
export const isProjectScope = (scope: Scope): scope is ProjectScope =>
  scope.kind === 'project' || scope.kind === 'task'
