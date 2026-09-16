import { Conflict, NotFound, isUlid } from '@repo/kernel'
import {
  normaliseImportPath,
  sessionMarkerFile,
  stagedFile,
  stagingDir,
  stagingRoot,
} from '@repo/microtask-domain'
import type { ApiDeps } from '../../../deps.js'
import { IMPORT_CHUNK_LIMIT_BYTES } from '../../../http/body-limits.js'
import { PRODUCT } from '../product.js'

/**
 * How long an unconfirmed session survives before the next `open` sweeps it.
 *
 * Twenty-four hours, and the direction of the risk is what sets it. Sweeping early destroys an
 * upload that is still arriving or a preview an admin is still reading; sweeping late costs disk
 * until the next import, bounded by {@link MAX_SESSION_BYTES} per session. There is no scheduler
 * in this deployment and ADR 0045 adds none, so a TTL far longer than any plausible upload plus
 * decision is the cheap side to err on.
 */
export const SESSION_TTL_MS = 86_400_000

/**
 * The most bytes one session may hold, across every file staged into it.
 *
 * Import is admin-only, so this is not a defence against a hostile principal — an admin can
 * already delete every project. It is the bound ADR 0044 asks for against an accidental drop of
 * the wrong directory filling the volume, which would take the API down for a reason nothing in
 * the UI would explain.
 *
 * A hundred million bytes is a hundred chunks of {@link IMPORT_CHUNK_LIMIT_BYTES}, and it sits
 * above the ~80 MB ceiling ADR 0044 computes for one legitimate task or legacy project file — 40
 * tabs at `MAX_DOCUMENT_BYTES` each — so no single file this product's own limits admit is refused
 * by it. Against the live volume that ADR measures at 8,608 bytes it is around four orders of
 * magnitude of headroom. What an operator who exceeds it sees is a message naming the cap and the
 * bytes already staged, rather than a 413 they cannot act on.
 */
export const MAX_SESSION_BYTES = 100_000_000

/** An open session and the two bounds ADR 0044 sets on uploading into it. */
export interface StagedSession {
  readonly sessionId: string
  readonly openedAt: string
  readonly maxChunkBytes: number
  readonly maxSessionBytes: number
}

/** Where one chunk landed, what it added, and what the session now holds. */
export interface StagedChunk {
  readonly path: string
  readonly chunkBytes: number
  readonly sessionBytes: number
}

interface Marker {
  readonly openedAt: string
  readonly bytes: number
}

const isMarker = (value: unknown): value is Marker => {
  if (typeof value !== 'object' || value === null) return false
  const { openedAt, bytes } = value as Partial<Marker>
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return false
  return typeof openedAt === 'string' && !Number.isNaN(Date.parse(openedAt))
}

const parsed = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

const full = (staged: number): string =>
  `This import session already holds ${String(staged)} bytes and is capped at ${String(MAX_SESSION_BYTES)}. Confirm it and stage the rest in another session, or drop fewer files — one file larger than the cap cannot be staged at all.`

/**
 * The staging area one import session occupies, and the only thing that writes under `import/`.
 *
 * It reaches the disk through the injected `FileSystem` port alone, so a route test drives the
 * real composed app against the in-memory adapter and still exercises this code — which is the
 * last consequence ADR 0044 records. Nothing here touches `projects/`: every path comes from a
 * builder in `@repo/microtask-domain`, and those keep the three roots of ADR 0045 apart.
 *
 * The session's `openedAt` and its running byte total live in a small marker file rather than in
 * this process, because a chunked upload straddles requests and a restart between two of them must
 * not lose the accounting — and because a sweep measured against filesystem mtimes could only be
 * tested by touching them, which is a case that gets skipped on one platform.
 *
 * **Every public method here takes `lock.run` itself, so none of them may be called from inside a
 * `lock.run`.** `QueueLock` is not reentrant and its failure is not a slow import: the inner
 * `run` chains onto a promise that only settles when the outer work finishes, and the outer work
 * is waiting on the inner one, so `#chain` is left pointing at a promise that never settles and
 * **every subsequent write anywhere in the process hangs forever** while reads and `/healthz`
 * keep answering 200. A confirm that wants one lock around a whole apply therefore cannot reuse
 * these; the private helpers below (`#read`, `#write`, `#sweep`) are deliberately lock-free, so
 * exposing a lock-free variant beside a public one is a cheap change when that day comes.
 */
export class ImportStaging {
  readonly #deps: ApiDeps

  /** Creates the staging area over the injected ports and the configured data root. */
  constructor(deps: ApiDeps) {
    this.#deps = deps
  }

  /**
   * Opens a session, sweeping every session older than {@link SESSION_TTL_MS} on the way in.
   *
   * The sweep is here and nowhere else because there is no scheduler: it needs no timer and it
   * runs exactly when someone is importing, which is the only time the directory grows. Both run
   * inside one `lock.run` so a second `open` cannot observe a half-swept root — and neither the
   * sweep nor the marker write takes the lock itself, `Lock` not being reentrant.
   *
   * A session directory whose marker is missing or unreadable is swept too — unreadable meaning
   * any of: absent, not JSON, no finite `bytes`, or an `openedAt` that is not an instant. That
   * last one is a stated rule rather than an accident of the comparison below: without it a
   * marker reading `"tuesday"` would be swept only because `Date.parse` gives `NaN` and every
   * comparison against `NaN` is false. Such a directory cannot be a session mid-open, because the
   * marker is the first thing written and the lock is held while it is, so it is either debris
   * from an interrupted write or something this API did not put there.
   */
  async open(): Promise<StagedSession> {
    return this.#deps.lock.run(async () => {
      await this.#sweep()
      const sessionId = this.#deps.ids.entityId()
      const openedAt = this.#deps.clock.now()
      await this.#write(sessionId, { openedAt, bytes: 0 })
      return {
        sessionId,
        openedAt,
        maxChunkBytes: IMPORT_CHUNK_LIMIT_BYTES,
        maxSessionBytes: MAX_SESSION_BYTES,
      }
    })
  }

  /**
   * Appends one chunk to the file this session stages at `harvested`.
   *
   * The path is re-normalised here rather than trusted, because whatever arrives was last touched
   * by a client: `normaliseImportPath` is the server's authority on what a path may be and it
   * refuses a traversal, an absolute path, a drive letter and a control character. That refusal
   * rejects **this file** and leaves the session alone — every file already staged is still there
   * and the next chunk of another file is still accepted.
   *
   * Resolving the path before the lock is taken is deliberate: a path that will never be written
   * is refused without a disk read, so a hostile path cannot be used to probe which session ids
   * exist. The read-modify-write of the marker that follows is what the lock is for, since §7.3
   * uploads files concurrently even though the chunks of one file arrive in sequence.
   *
   * The chunk's own size is bounded by the route's limiter rather than re-checked here; the
   * session total is bounded here, because this marker is the only thing that knows it.
   */
  async append(sessionId: string, harvested: string, bytes: Uint8Array): Promise<StagedChunk> {
    const at = normaliseImportPath(harvested)
    const file = stagedFile(this.#root(), PRODUCT, sessionId, at)
    return this.#deps.lock.run(async () => {
      const marker = await this.#read(sessionId)
      if (marker === null) throw new NotFound('Import session not found')
      const sessionBytes = marker.bytes + bytes.length
      if (sessionBytes > MAX_SESSION_BYTES) throw new Conflict(full(marker.bytes))
      await this.#deps.fileSystem.appendBytes(file, bytes)
      await this.#write(sessionId, { openedAt: marker.openedAt, bytes: sessionBytes })
      return { path: at, chunkBytes: bytes.length, sessionBytes }
    })
  }

  async #sweep(): Promise<void> {
    const root = this.#root()
    const cutoff = Date.parse(this.#deps.clock.now()) - SESSION_TTL_MS
    for (const id of await this.#deps.fileSystem.listDirs(stagingRoot(root, PRODUCT))) {
      if (!isUlid(id)) continue
      const marker = await this.#read(id)
      if (marker !== null && Date.parse(marker.openedAt) >= cutoff) continue
      await this.#deps.fileSystem.removeDir(stagingDir(root, PRODUCT, id))
    }
  }

  async #read(sessionId: string): Promise<Marker | null> {
    const at = sessionMarkerFile(this.#root(), PRODUCT, sessionId)
    const raw = await this.#deps.fileSystem.readText(at)
    if (raw === null) return null
    const found = parsed(raw)
    return isMarker(found) ? found : null
  }

  async #write(sessionId: string, marker: Marker): Promise<void> {
    const at = sessionMarkerFile(this.#root(), PRODUCT, sessionId)
    await this.#deps.fileSystem.writeTextAtomic(at, JSON.stringify(marker))
  }

  #root(): string {
    return this.#deps.config.dataDir
  }
}
