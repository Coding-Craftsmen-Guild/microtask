import type { Principal } from '@repo/kernel'
import type { ProjectStore, TokenIndex } from '@repo/microtask-domain'
import type { AdminTokens } from './admin-verifier.js'

/** The collaborators resolution needs, every one of them a port or a narrow interface. */
export interface PrincipalResolverOptions {
  /** Checks whether a bearer value is an admin token this API minted. */
  readonly admin: AdminTokens

  /** Resolves a share token to the one project that owns it. */
  readonly tokens: TokenIndex

  /** Reads the manifest the link's current role and scope live in. */
  readonly store: ProjectStore
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
 * re-checked its write permission inside the lock rather than trusting the one it read first.
 */
export class PrincipalResolver {
  readonly #admin: AdminTokens
  readonly #tokens: TokenIndex
  readonly #store: ProjectStore

  /** Creates the resolver over its injected collaborators. */
  constructor(options: PrincipalResolverOptions) {
    this.#admin = options.admin
    this.#tokens = options.tokens
    this.#store = options.store
  }

  /** Resolves a bearer value to a principal, or null when it names nobody. */
  async resolve(bearer: string): Promise<Principal | null> {
    if (this.#admin.verify(bearer)) return { kind: 'admin' }
    const owner = this.#tokens.find(bearer)
    if (owner === null) return null
    const found = await this.#store.readManifest(owner.product, owner.projectId)
    const link = found?.shareLinks.find((candidate) => candidate.token === bearer)
    if (link === undefined) return null
    return { kind: 'link', role: link.role, scope: link.scope, token: link.token }
  }
}
