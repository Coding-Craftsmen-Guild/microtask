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

/**
 * The environment of the one subtree that has a service identity and no principal yet.
 *
 * `POST /v1/auth/login` runs there. Typing it with this rather than with {@link ApiEnv} is what
 * makes the absence of a principal a compiler fact instead of a comment: `c.get('principal')`
 * inside that subtree does not typecheck, so a handler cannot read a variable that no middleware
 * on its path ever sets. `ApiEnv`'s promise that both variables are present therefore stays
 * true everywhere it is used, rather than acquiring an exception.
 */
export interface ServiceEnv {
  /** Per-request state set by the service-key guard, which authenticates the caller and no one else. */
  Variables: {
    /** Which app is calling, named by the service key it presented rather than by what it claims. */
    service: string
  }
}
