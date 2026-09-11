import type { DocumentValue } from '@repo/contracts'
import type { SaveDocument, SaveState } from './save-document'

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
   * Called before switching tab and before deleting one. Without it a queued autosave lands
   * after the DELETE and resurrects the content that was just removed.
   */
  markClean(): void {
    this.#cancel()
    this.#dirty = false
    this.#setState('idle')
  }

  /** Stops the loop. A disposed instance never writes again. */
  dispose(): void {
    this.#cancel()
  }

  /**
   * Writes now, if there is anything to write.
   *
   * A `keepalive` flush measures the body first and attempts nothing above
   * {@link KEEPALIVE_MAX_BYTES}, leaving the document dirty. That is not a lost save: the
   * browser's own unsaved-changes prompt is the guard on that path, and the 700 ms debounce is
   * what actually makes edits durable (ADR 0028).
   */
  async flush(keepalive = false): Promise<void> {
    this.#cancel()
    const document_ = this.#document
    if (!this.#dirty || document_ === null || this.#state === 'conflict') return
    if (keepalive && utf8Bytes(document_) >= KEEPALIVE_MAX_BYTES) return
    this.#dirty = false
    const outcome = await this.#save({ document: document_, ifMatch: this.#stamp, keepalive })
    if (outcome.kind === 'saved') {
      this.#stamp = outcome.updatedAt
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
