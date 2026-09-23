import type { MiddlewareHandler } from 'hono'
import { Forbidden, type Action, type Product, type Scope } from '@repo/kernel'
import { notPermitted } from './authorize.js'
import type { ApiEnv } from './env.js'

const SCOPE_PRODUCTS: Readonly<Record<Scope['kind'], Product>> = {
  project: 'microtask',
  task: 'microtask',
  plan: 'macroplan',
}

const ROOT_READS: Readonly<Record<Product, Action>> = {
  microtask: 'project:read',
  macroplan: 'plan:read',
}

/**
 * The product guard: a link rooted in the other product is refused before any handler runs.
 *
 * One consolidated token index resolves a bearer to a `TokenOwner`, and `PrincipalResolver` reads
 * the live role and scope from whichever product owns it, so a principal resolved from **either**
 * product's token is presented to **every** route tree. A Microtask tree therefore has to say what
 * it accepts, and saying it once at the mount is the only shape that scales: the alternative is a
 * narrowing per handler, and the last time that was chosen it was justified by the claim that one
 * route needed it — a claim `search`'s gate already falsified.
 *
 * `search` is why this is not merely tidier. Its target *is* the caller's own scope, so a plan
 * principal asked `project:read` about a `plan` target and `can()` cleared it: `SCOPE_TARGETS.plan`
 * admits `plan`, `sameRoot` compared the scope against itself, and `view` grants `project:read`
 * alongside `plan:read`. A nonsense question, answered yes. No row ever came back — every candidate
 * is filtered against a project-, folder- or task-shaped target, and a plan scope reaches none of
 * them — so what leaked was the 200 itself, and a 200 is still the wrong answer.
 *
 * It refuses with **403 and the gate's own wording**. 404 would claim the caller's link does not
 * exist, which is untrue: it exists, in the other product. The action named is the read on the
 * product's own top-level resource — `plan:read` here, `project:read` on Microtask's side — because
 * that is what a foreign holder was refused by the per-handler check this replaces, so no caller sees
 * a message change.
 *
 * It coincides with the handler's own gate on the **resource-scoped routes only**. Each product's two
 * collection routes gate a workspace action instead: `GET`/`POST /plans` ask `workspace:list-plans`
 * and `workspace:create-plan`, `GET`/`POST /projects` their `project` equivalents. So on those four a
 * same-product seat is refused a different sentence from a cross-product one, and this action is not
 * "the least any route in the subtree asks" — the collection routes ask something else entirely. What
 * that leaks is which layer refused a caller about the product it already holds a link in, and the
 * alternative is this middleware deriving an action per path, which is the per-handler narrowing it
 * exists to remove.
 *
 * It refuses **only a link**. An admin principal carries no scope (ADR 0013) and is the one
 * credential that could not be described by a product at all. That it reaches both products is
 * deliberate rather than an oversight this forgot to close: ADR 0014's 2026-09-22 amendment records
 * the reasoning — there is one admin, and a credential that could reach the other product's routes
 * reaches data that admin already has a password for.
 *
 * Both tables are keyed `Record`s rather than tests against one value, so a fourth `Scope` variant
 * or a third `Product` fails to compile here until someone decides where it belongs — the same
 * direction `isProjectScope` enumerates in, and the opposite of a `!== 'plan'` test that would
 * silently admit the next variant into whichever product it was written against.
 *
 * Like every guard in this tree it must be registered **before** the routes it protects, and
 * **after** `requirePrincipal`: it reads `c.get('principal')`, which that middleware sets. Placing
 * it in the parent at the mount prefix instead would put it ahead of the principal it needs.
 */
export function requireProduct(product: Product): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const principal = c.get('principal')
    if (principal.kind === 'link' && SCOPE_PRODUCTS[principal.scope.kind] !== product) {
      throw new Forbidden(notPermitted(ROOT_READS[product]))
    }
    await next()
  }
}
