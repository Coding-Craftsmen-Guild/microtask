import type { Product } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'

/** Which project a share token belongs to. */
export interface TokenOwner {
  readonly product: Product
  readonly projectId: string
}

/**
 * Resolution of a share token to the one project that owns it.
 *
 * A token is a bearer credential, so exactly one project may hold it at a time and the lookup has
 * to answer without the caller knowing which project to ask. Where that mapping is kept is the
 * adapter's business (ADR 0030); a service only ever names this port.
 */
export interface TokenIndex {
  /** Resolves a token to its owning project, or null when no project owns it. */
  find(token: string): TokenOwner | null

  /**
   * Reports which of `tokens` are already owned by a project other than the one named, so a
   * caller can refuse a whole write before any of it lands.
   */
  collisions(product: Product, projectId: string, tokens: readonly string[]): readonly string[]

  /**
   * Replaces the tokens recorded for one project with the ones its manifest now carries,
   * throwing `Conflict` — and recording nothing — if any of them belongs to another project.
   */
  add(product: Product, manifest: ProjectManifest): void

  /** Drops every token belonging to one project, leaving other projects' tokens alone. */
  removeProject(product: Product, projectId: string): void
}
