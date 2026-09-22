import { Conflict } from '../errors.js'
import type { TokenIndex, TokenOwner } from './token-index.js'

const key = (owner: TokenOwner): string => `${owner.product}/${owner.containerId}`

/**
 * A TokenIndex that keeps its mapping in this process and consults nothing outside it.
 *
 * The key is the product **and** the container id, never the id alone: the two products draw their
 * ids from separate ULID sequences, so one id can name both a project and a plan, and those are two
 * containers holding two sets of tokens.
 */
export class ShareIndex implements TokenIndex {
  readonly #owners = new Map<string, TokenOwner>()

  /** Resolves a token to its owning container, or null when unknown. */
  find(token: string): TokenOwner | null {
    return this.#owners.get(token) ?? null
  }

  /** Reports which of `tokens` are already owned by a different container. */
  collisions(owner: TokenOwner, tokens: readonly string[]): readonly string[] {
    const mine = key(owner)
    return tokens.filter((token) => {
      const held = this.#owners.get(token)
      return held !== undefined && key(held) !== mine
    })
  }

  /**
   * Replaces the tokens recorded for one container, refusing any collision.
   *
   * Every token is checked before any is written, so a refusal leaves the index exactly as it was
   * — the caller's own store write is then the only thing that has to be undone, and there is
   * nothing to undo here. A loop that checked and set per token would leave the tokens ahead of
   * the clash recorded against a container whose write never landed.
   *
   * The owner is copied rather than stored by reference, so a caller reusing one mutable object
   * across calls cannot rewrite what this index already answered.
   */
  add(owner: TokenOwner, tokens: readonly string[]): void {
    const clashing = this.collisions(owner, tokens)
    if (clashing.length > 0) {
      throw new Conflict(`Share token already belongs to another container: ${clashing.join(', ')}`)
    }
    const mine: TokenOwner = { product: owner.product, containerId: owner.containerId }
    this.remove(mine)
    for (const token of tokens) this.#owners.set(token, mine)
  }

  /** Drops every token belonging to one container. */
  remove(owner: TokenOwner): void {
    const mine = key(owner)
    for (const [token, held] of this.#owners) {
      if (key(held) === mine) this.#owners.delete(token)
    }
  }
}
