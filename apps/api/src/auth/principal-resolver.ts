import type { Principal, Product, TokenIndex } from '@repo/kernel'
import type { AdminTokens } from './admin-verifier.js'
import type { LinkDirectory } from './link-directory.js'

/** The collaborators resolution needs, every one of them a port or a narrow interface. */
export interface PrincipalResolverOptions {
  /** Checks whether a bearer value is an admin token this API minted. */
  readonly admin: AdminTokens

  /** Resolves a share token to the one container that owns it, in either product. */
  readonly tokens: TokenIndex

  /** Where each product's live link is read from, one entry per product. */
  readonly directories: Readonly<Record<Product, LinkDirectory>>
}

/**
 * Turns a bearer credential into a {@link Principal}, or into nothing at all.
 *
 * This is the security boundary ADR 0008 names: `can()` is pure, so the real work is turning a
 * credential into a principal, and getting that wrong makes every role rule decoration. Admin
 * tokens are checked first, so a share token can never be read as admin whatever it contains.
 *
 * A link's role and scope are read from the manifest on **every** request rather than cached
 * beside the token. That is what makes a revocation or a downgrade take effect on the next call
 * instead of whenever a cache happened to expire — the same reason the app being replaced
 * re-checked its write permission inside the lock rather than trusting the one it read first. It
 * holds for both products, and it is also why a container that has since been deleted resolves to
 * `null` rather than raising: the read answers "no such link", which is what a revoked link and a
 * deleted project or plan have in common from a bearer's point of view.
 *
 * **The token index is asked once, not once per product.** A bearer is an opaque string, so the
 * index is the only thing that can say which product it belongs to; two per-product indexes would
 * make this method try both and choose, and a resolver that guesses in the authorization path is
 * the drift `TokenIndex` was moved into `@repo/kernel` to prevent. What it returns then selects the
 * directory, so exactly one manifest is read for exactly one bearer.
 *
 * `resolve()` can therefore return a **plan**-scoped principal as legitimately as a project-scoped
 * one. Nothing downstream may assume otherwise: a route tree that needs the narrower scope has to
 * prove it, which is why `routes/microtask/shares/handlers.ts` narrows with `isProjectScope` rather
 * than asserting the shape this method used to be unable to produce.
 */
export class PrincipalResolver {
  readonly #admin: AdminTokens
  readonly #tokens: TokenIndex
  readonly #directories: Readonly<Record<Product, LinkDirectory>>

  /** Creates the resolver over its injected collaborators. */
  constructor(options: PrincipalResolverOptions) {
    this.#admin = options.admin
    this.#tokens = options.tokens
    this.#directories = options.directories
  }

  /** Resolves a bearer value to a principal, or null when it names nobody. */
  async resolve(bearer: string): Promise<Principal | null> {
    if (this.#admin.verify(bearer)) return { kind: 'admin' }
    const owner = this.#tokens.find(bearer)
    if (owner === null) return null
    const live = await this.#directories[owner.product].readLink(owner.containerId, bearer)
    if (live === null) return null
    return { kind: 'link', role: live.role, scope: live.scope, token: bearer }
  }
}
