import type { DocumentValue } from '@repo/contracts'
import type { SaveDocument, SaveOutcome, SaveState } from './save-document'

/** How long after the last change a write is sent, in milliseconds. */
export const SAVE_DEBOUNCE_MS = 700

/** How long after a failed write the next attempt is sent, in milliseconds. Forever. */
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

  /** Called every time the state changes, never with the state it already had. */
  readonly onState: (state: SaveState, message: string) => void
}

const utf8Bytes = (document_: DocumentValue): number =>
  new TextEncoder().encode(JSON.stringify(document_)).length

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

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
 * an edit that is not stored yet.
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

  /** Whether there are edits the server does not have. */
  get dirty(): boolean {
    return this.#dirty
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
   * In `conflict` the document is still recorded and no write is armed: the edits are kept so
   * the user can be told before anything is discarded, and the tab stays quiet rather than
   * answering one 409 with an endless stream of them (ADR 0016).
   */
  change(document_: DocumentValue): void {
    this.#document = document_
    this.#dirty = true
    if (this.#state === 'conflict') return
    this.#setState('saving')
    this.#arm(SAVE_DEBOUNCE_MS)
  }

  /**
   * Declares the edits no longer this tab's business, and cancels any pending write.
   *
   * Called before deleting a tab. Without it a queued autosave lands after the DELETE and
   * resurrects the content that was just removed. A write already in flight is let finish, and
   * its stamp is kept, but its outcome is not reported: a failure against a tab that no longer
   * exists would otherwise be retried every four seconds, forever.
   */
  markClean(): void {
    this.#cancel()
    this.#epoch += 1
    this.#dirty = false
    this.#setState('idle')
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
    if (!this.#dirty || document_ === null || this.#state === 'conflict') return
    if (keepalive && utf8Bytes(document_) >= KEEPALIVE_MAX_BYTES) return
    this.#cancel()
    this.#dirty = false
    const epoch = this.#epoch
    const outcome = await this.#save({ document: document_, ifMatch: this.#stamp, keepalive }).catch(
      (error: unknown): SaveOutcome => ({ kind: 'failed', message: messageOf(error) }),
    )
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
    this.#setState('retrying')
    this.#arm(SAVE_RETRY_MS)
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
