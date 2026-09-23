import type { RouteHandler } from '@hono/zod-openapi'
import type { Action, Principal, Scope, Target } from '@repo/kernel'
import type { SearchService } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type { searchRoute } from './routes.js'

/** The question one principal's search is put to the policy as. */
export interface SearchGate {
  /** What the caller is asking permission to do. */
  readonly action: Action

  /** What it is asking to do it to. */
  readonly target: Target
}

const scopeAction = (scope: Scope): Action => (scope.kind === 'task' ? 'task:read' : 'project:read')

/**
 * What this principal is asking permission for when it searches (ADR 0009).
 *
 * An admin is asking to search across everything, which is what `workspace:search` means and why
 * it is admin-only. A link holder is asking a narrower question — may I search the thing I
 * already hold — so the gate asks about its own scope root. Gating the route on
 * `workspace:search` for everybody would refuse every link principal outright and leave the
 * per-principal filtering underneath it unreachable.
 *
 * A `Scope` and a `Target` share their shapes, so a link's reach is handed to the policy with no
 * translation that could drift from it. Exported because it is the only part of this route the
 * gate cannot demonstrate from outside: every principal that reaches the handler holds the
 * authority its own scope root implies, so no request can be refused here and only a direct test
 * of this table can show it asks the right question.
 *
 * That it cannot refuse anybody is why the **product** is not its business. Handed a plan scope it
 * asked `project:read` about a `plan` target and `can()` said yes — a question with no meaning,
 * permitted only because `view` grants `project:read` and `plan:read` together. Nothing was
 * disclosed beyond the 200 itself, because `visibleTo` clears each candidate against a project-,
 * folder- or task-shaped target and a plan scope reaches none of them. The scope this receives is
 * project-rooted because `requireProduct` refused the other product at the mount, and the fix
 * belongs there rather than here: a check in this table would be the third copy of one rule.
 */
export const searchGate = (principal: Principal): SearchGate =>
  principal.kind === 'admin'
    ? { action: 'workspace:search', target: { kind: 'workspace' } }
    : { action: scopeAction(principal.scope), target: principal.scope }

/**
 * Answers every name matching the query that this caller may be told.
 *
 * One `authorize` call over a target derived from the principal, rather than three routes or
 * three branches of gating. What the gate cannot do here is refuse anybody, so the refusals that
 * matter are the per-row ones `SearchService` makes, and those are what the tests beside this
 * measure: a link scoped to one project is never told another's names, and a link scoped to one
 * task is told neither its folder nor its siblings.
 */
export const search =
  (searches: SearchService): RouteHandler<typeof searchRoute, ApiEnv> =>
  async (c) => {
    const { q } = c.req.valid('query')
    const { action, target } = searchGate(c.get('principal'))
    const principal = authorize(c, action, target)
    const results = await searches.search(PRODUCT, principal, q)
    return c.json({ results }, 200)
  }
