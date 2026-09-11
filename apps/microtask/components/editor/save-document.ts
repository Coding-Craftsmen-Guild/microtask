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
 * What one write answered, as four outcomes rather than a thrown error.
 *
 * Only a `failed` write is retried on a timer, because only it can land unchanged later: the
 * request never arrived, or the server was busy or broken (a transport failure, 408, 429, 5xx).
 * A `conflict` must never be, or the loop turns one 409 into a permanent one (ADR 0016). A
 * `refused` write — a 401 or 403 for a credential that is gone or downgraded, a 404 for a tab
 * that is gone, a 413 or 422 for a body the server will not take — is refused again every time
 * it is sent, so it waits for the user to ask (ADR 0016, ADR 0028). Separate variants are what
 * stop a caller collapsing them.
 */
export type SaveOutcome =
  | { readonly kind: 'saved'; readonly updatedAt: string }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'refused'; readonly message: string }

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
 * than the absence of one because it has to be reachable from `saved`. `conflict` and
 * `refused` are the two in which the loop holds edits it will not write on its own.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'retrying' | 'conflict' | 'refused'
