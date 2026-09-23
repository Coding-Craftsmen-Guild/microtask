import type { Product } from '../product.js'

/**
 * Which container — a project or a plan — a share token belongs to.
 *
 * **One product tag means one kind of token-owning container, and this key is only unambiguous
 * while that holds.** The two products draw their ids from separate ULID sequences, so a project
 * and a plan can share an id; `product` is what keeps those apart. What it cannot keep apart is two
 * container kinds *within* one product. Give Microtask a second shareable container and a member of
 * it sharing a project's ULID keys to the same owner — and `add` **replaces** an owner's tokens, so
 * the two would evict each other's tokens with **no `Conflict` raised**: the collision check passes,
 * because to it they are the same container writing twice. Every evicted link then answers 401 while
 * its manifest still holds it, which is the failure `warmTokenIndex` was measured hitting when plans
 * were briefly listed under `microtask/`.
 *
 * So a second shareable container kind in either product is the point at which this key needs a
 * **third field** naming the kind — not a naming convention on `containerId`, which `find` and
 * `remove` would have to parse. Recorded here rather than only at the adapters that warm the index,
 * because whoever adds that container will be editing a domain package or this one, and will reach
 * for `TokenOwner` long before they read `apps/api/src/runtime.ts`.
 */
export interface TokenOwner {
  /** Which product owns the container. Never enough on its own; see above. */
  readonly product: Product

  /** The container's own id, unique among that product's containers of the one shareable kind. */
  readonly containerId: string
}

/**
 * Resolution of a share token to the one container that owns it.
 *
 * A token is a bearer credential, so exactly one container may hold it at a time and the lookup has
 * to answer without the caller knowing which container to ask. **That is also why this port is here
 * rather than in a product package.** A bearer arrives as an opaque string and the index is the
 * thing that says which product it belongs to, so one index per product would mean
 * `PrincipalResolver` asking both and choosing between their answers — two lookups, two ways to be
 * wrong, in the authorization path. It is expressed in strings and a {@link Product} alone, so it
 * takes no product's entities with it (ADR 0014). Where the mapping is kept is the adapter's
 * business (ADR 0030); a service only ever names this port.
 */
export interface TokenIndex {
  /** Resolves a token to its owning container, or null when nothing owns it. */
  find(token: string): TokenOwner | null

  /**
   * Reports which of `tokens` are already owned by a container other than the one named, so a
   * caller can refuse a whole write before any of it lands.
   */
  collisions(owner: TokenOwner, tokens: readonly string[]): readonly string[]

  /**
   * Replaces the tokens recorded for one container, throwing `Conflict` — and recording
   * nothing — if any of them belongs to another.
   */
  add(owner: TokenOwner, tokens: readonly string[]): void

  /** Drops every token belonging to one container, leaving other containers' tokens alone. */
  remove(owner: TokenOwner): void
}
