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
