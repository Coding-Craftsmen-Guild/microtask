import type { DocumentValue } from '@repo/contracts'
import type { SaveDocument, SaveOutcome, SaveRequest, SaveState } from './save-document'

/** How long after the last change a write is sent, in milliseconds. */
export const SAVE_DEBOUNCE_MS = 700

/**
 * How long after a failed write the next attempt is sent, in milliseconds, for as long as the
 * failure is one a retry can outlast. A refusal is not retried on a timer at all.
 */
export const SAVE_RETRY_MS = 4000

/**
 * The largest body a `beforeunload` flush will attempt, in UTF-8 bytes.
 *
 * Headroom under the 64 KiB `keepalive` cap, which is a budget **shared** across the fetch
 * group rather than a per-request limit — so a body near it fails as a network error, which is
 * exactly the silent loss flushing on unload was supposed to prevent (ADR 0028).
 */
export const KEEPALIVE_MAX_BYTES = 50_000

/** What an {@link Autosave} needs to do its job. */
export interface AutosaveOptions {
  /** The tab's `updatedAt` as the server last reported it. */
  readonly updatedAt: string

  /** Where a write goes. */
  readonly save: SaveDocument

  /**
   * Called on every transition the loop makes, a repeat included: an edit landing while a
   * write is in flight reports `saving` again, which is what keeps `Saved` off the screen.
   */
  readonly onState: (state: SaveState, message: string) => void
}

const utf8Bytes = (document_: DocumentValue): number =>
  new TextEncoder().encode(JSON.stringify(document_)).length

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const failure = (error: unknown): SaveOutcome => ({ kind: 'failed', message: messageOf(error) })

const attempt = (save: SaveDocument, request: SaveRequest): Promise<SaveOutcome> => {
  try {
    return save(request).catch(failure)
  } catch (error) {
    return Promise.resolve(failure(error))
  }
}

/**
 * The autosave loop, reproducing the timings measured off the app being replaced.
 *
 * Framework-free on purpose: every one of its interesting behaviours is a question about order
 * and about clocks, and a plain object is the only shape in which those can be driven by a fake
 * timer rather than inferred from a rendered result.
 *
 * The ordering that matters is in {@link flush}. `dirty` is cleared **before** the await and
 * restored on failure, and `Saved` is shown only if it is still clear when the answer arrives —
 * so a keystroke landing mid-flight leaves the indicator saying `Saving…`, never `Saved` over
 * an edit that is not stored yet. A save that rejects and a save that throws before returning
 * a promise are both a failure; the call stays synchronous, because a `beforeunload` flush has
 * to start its request before the page goes.
 *
 * Two outcomes stop the loop with the edits held: a `conflict`, which only a reload resolves,
 * and a `refused` write, which only {@link retry} sends again. Legacy retried every failure every
 * four seconds for as long as the page stayed open, so a revoked link's page sent a refused save
 * fifteen times a minute and told its user it was retrying (ADR 0016).
 */
export class Autosave {
  readonly #save: SaveDocument
  readonly #onState: (state: SaveState, message: string) => void
  #stamp: string
  #document: DocumentValue | null = null
  #message = ''
  #dirty = false
  #state: SaveState = 'idle'
  #timer: ReturnType<typeof setTimeout> | null = null
  #inFlight: Promise<void> | null = null
  #epoch = 0

  /** Starts clean, on the stamp the server reported for this tab. */
  constructor(options: AutosaveOptions) {
    this.#save = options.save
    this.#onState = options.onState
    this.#stamp = options.updatedAt
  }

  /** What the indicator should be showing. */
  get state(): SaveState {
    return this.#state
  }

  /** Whether there are edits no write has been sent for yet. */
  get dirty(): boolean {
    return this.#dirty
  }

  /**
   * Whether any edit is not yet known to be stored: one still dirty, or one a write in flight
   * carries. `dirty` alone goes false the moment that write is sent, which is before the server
   * has answered, so it cannot be what the unsaved-changes prompt asks (ADR 0028).
   */
  get pending(): boolean {
    return this.#dirty || this.#inFlight !== null
  }

  /** The stamp the next write will present, which the last successful write set. */
  get updatedAt(): string {
    return this.#stamp
  }

  /** What the last failure said, for a surface that wants to show it. Empty until one. */
  get message(): string {
    return this.#message
  }

  /**
   * Records a new document and arms the debounce.
   *
   * In `conflict` or `refused` the document is still recorded and no write is armed: the edits
   * are kept so the user can be told before anything is discarded, or copy them out, and the tab
   * stays quiet rather than answering one 409 or one revoked link with an endless stream of the
   * same answer (ADR 0016).
   */
  change(document_: DocumentValue): void {
    this.#document = document_
    this.#dirty = true
    if (this.#held()) return
    this.#setState('saving')
    this.#arm(SAVE_DEBOUNCE_MS)
  }

  /**
   * Declares the edits no longer this tab's business, and cancels any pending write.
   *
   * Called before deleting a tab. Without it a queued autosave lands after the DELETE and
   * resurrects the content that was just removed. A write already in flight is let finish, and
   * its stamp is kept, but its outcome is not reported: a failure against a tab that no longer
   * exists would otherwise be retried every four seconds, or left on screen as a refusal.
   */
  markClean(): void {
    this.#cancel()
    this.#epoch += 1
    this.#dirty = false
    this.#setState('idle')
  }

  /**
   * Writes now because the user asked, which is the only way out of `refused`: a credential
   * restored elsewhere — the admin signed in again in another tab — or a body shortened below
   * the cap is something only the user knows about. In `retrying` it overtakes the timer; in
   * `conflict` it writes nothing, since only a reload resolves a 409 (ADR 0016).
   */
  retry(): Promise<void> {
    if (this.#state === 'refused') this.#setState('saving')
    return this.flush()
  }

  /** Cancels a pending write or retry. Called on unmount, once the last flush has settled. */
  dispose(): void {
    this.#cancel()
  }

  /**
   * Writes now, if there is anything to write, and settles once the write has.
   *
   * Writes are serialised: a flush arriving while one is in flight waits for its answer and then
   * decides afresh, on the stamp that answer carried. Two writes in flight would present the same
   * `If-Match`, and the second would come back 409 — the loop reporting a conflict with itself,
   * which any save slower than the debounce would do while the user kept typing (ADR 0016).
   *
   * A `keepalive` flush measures the body first and attempts nothing at or above
   * {@link KEEPALIVE_MAX_BYTES}, leaving the document dirty **and the debounce armed**: if the
   * user answers the unsaved-changes prompt by staying, the edit still saves. The prompt is the
   * guard on that path, and the 700 ms debounce is what actually makes edits durable (ADR 0028).
   */
  flush(keepalive = false): Promise<void> {
    const previous = this.#inFlight
    const run = previous === null ? this.#write(keepalive) : previous.then(() => this.#write(keepalive))
    const tracked: Promise<void> = run.finally(() => {
      if (this.#inFlight === tracked) this.#inFlight = null
    })
    this.#inFlight = tracked
    return tracked
  }

  async #write(keepalive: boolean): Promise<void> {
    const document_ = this.#document
    if (!this.#dirty || document_ === null || this.#held()) return
    if (keepalive && utf8Bytes(document_) >= KEEPALIVE_MAX_BYTES) return
    this.#cancel()
    this.#dirty = false
    const epoch = this.#epoch
    const outcome = await attempt(this.#save, { document: document_, ifMatch: this.#stamp, keepalive })
    if (outcome.kind === 'saved') this.#stamp = outcome.updatedAt
    if (epoch === this.#epoch) this.#settle(outcome)
  }

  #settle(outcome: SaveOutcome): void {
    if (outcome.kind === 'saved') {
      if (!this.#dirty) this.#setState('saved')
      return
    }
    this.#dirty = true
    if (outcome.kind === 'conflict') {
      this.#setState('conflict')
      return
    }
    this.#message = outcome.message
    if (outcome.kind === 'refused') {
      this.#setState('refused')
      return
    }
    this.#setState('retrying')
    this.#arm(SAVE_RETRY_MS)
  }

  #held(): boolean {
    return this.#state === 'conflict' || this.#state === 'refused'
  }

  #arm(delay: number): void {
    this.#cancel()
    this.#timer = setTimeout(() => void this.flush(), delay)
  }

  #cancel(): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
  }

  #setState(state: SaveState): void {
    this.#state = state
    this.#onState(state, this.#message)
  }
}
