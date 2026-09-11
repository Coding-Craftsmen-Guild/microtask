import type { DocumentValue } from '@repo/contracts'

/** One conditional document write, as the editor island asks for it. */
export interface SaveRequest {
  /** The document to store, as the editor currently holds it. */
  readonly document: DocumentValue

  /**
   * The tab's last known `updatedAt`, sent as the write's precondition.
   *
   * Every write carries the version it is based on, including the first one after a 409 reload,
   * because the precondition is the whole of what turns a lost update into a visible conflict
   * (ADR 0016).
   */
  readonly ifMatch: string

  /**
   * Whether the request must outlive the page.
   *
   * Only ever true on `beforeunload`, and only for a body the island has already measured
   * against {@link KEEPALIVE_MAX_BYTES} — the budget is shared across a fetch group, so an
   * over-budget keepalive request fails as a network error rather than being truncated
   * (ADR 0028).
   */
  readonly keepalive: boolean
}

/**
 * What one write answered, as three outcomes rather than a thrown error.
 *
 * A conflict is a different fact from a failure, not a worse one: a failure is retried
 * indefinitely and a conflict must never be, or the retry loop turns one 409 into a permanent
 * one (ADR 0016). Making them separate variants is what stops the caller collapsing them.
 */
export type SaveOutcome =
  | { readonly kind: 'saved'; readonly updatedAt: string }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failed'; readonly message: string }

/**
 * Writes one tab's document.
 *
 * A prop rather than something the island reaches for, so the editor is testable with no server
 * and the route handler, the credentials and the authority resolution behind it are entirely
 * the caller's problem.
 */
export type SaveDocument = (request: SaveRequest) => Promise<SaveOutcome>

/**
 * What the save indicator is showing.
 *
 * `idle` is the blank the app being replaced set on every tab switch, and it is a state rather
 * than the absence of one because it has to be reachable from `saved`.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'retrying' | 'conflict'
