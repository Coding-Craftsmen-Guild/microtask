import { Conflict, type Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { TokenIndex, TokenOwner } from '../ports/token-index.js'

const key = (owner: TokenOwner): string => `${owner.product}/${owner.projectId}`

/** A TokenIndex that keeps its mapping in this process and consults nothing outside it. */
export class ShareIndex implements TokenIndex {
  readonly #owners = new Map<string, TokenOwner>()

  /** Resolves a token to its owning project, or null when unknown. */
  find(token: string): TokenOwner | null {
    return this.#owners.get(token) ?? null
  }

  /** Reports which of `tokens` are already owned by a different project. */
  collisions(product: Product, projectId: string, tokens: readonly string[]): readonly string[] {
    const mine = key({ product, projectId })
    return tokens.filter((token) => {
      const owner = this.#owners.get(token)
      return owner !== undefined && key(owner) !== mine
    })
  }

  /** Replaces the tokens recorded for one project, refusing any collision. */
  add(product: Product, manifest: ProjectManifest): void {
    const tokens = manifest.shareLinks.map((link) => link.token)
    const clashing = this.collisions(product, manifest.id, tokens)
    if (clashing.length > 0) {
      throw new Conflict(`Share token already belongs to another project: ${clashing.join(', ')}`)
    }
    this.removeProject(product, manifest.id)
    for (const token of tokens) this.#owners.set(token, { product, projectId: manifest.id })
  }

  /** Drops every token belonging to one project. */
  removeProject(product: Product, projectId: string): void {
    const mine = key({ product, projectId })
    for (const [token, owner] of this.#owners) {
      if (key(owner) === mine) this.#owners.delete(token)
    }
  }
}
