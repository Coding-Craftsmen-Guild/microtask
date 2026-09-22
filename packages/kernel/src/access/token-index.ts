import type { Product } from '../product.js'

/** Which container — a project or a plan — a share token belongs to. */
export interface TokenOwner {
  readonly product: Product
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
