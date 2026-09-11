import type { Principal } from '@repo/kernel'

/**
 * The Hono environment every app in this tree is constructed with.
 *
 * Both variables are set by `requirePrincipal` before any handler runs, and a handler may assume
 * they are there — nothing under the guarded subtree is reachable without them, because an
 * unmatched path under it is refused before the router looks for a route.
 *
 * The generic does **not** travel through `app.route()`: a child constructed as a bare
 * `OpenAPIHono` mounted into a parent typed with this env compiles, and `c.get('principal')`
 * inside it is a type error rather than the parent's `Principal`. Every level of the tree must
 * therefore name `OpenAPIHono<ApiEnv>` itself. Nothing at the type level stops an unguarded child
 * being mounted, which is why the guard's placement is pinned by a test instead.
 */
export interface ApiEnv {
  /** Per-request state, all of it set by the credential guard. */
  Variables: {
    /**
     * Who is making the request. A service key alone never produces one, which is the whole of
     * ADR 0012: the API always has a real principal, so `AccessPolicy` is genuinely the only gate.
     */
    principal: Principal

    /** Which app is calling, named by the service key it presented rather than by what it claims. */
    service: string
  }
}
