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
import { expandArchive } from './archive.js'
import { including, readMarker, type SessionMarker } from './session-marker.js'
import {
  assertFreshPaths,
  assertNoCollision,
  assertNoCollisionWith,
} from './session-paths.js'

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

/** Which archive was expanded, what it staged, and what the session now holds. */
export interface StagedArchive {
  readonly archive: string
  readonly files: number
  readonly bytes: number
  readonly sessionBytes: number
}

interface Archive {
  readonly marker: SessionMarker
  readonly at: string
  readonly bytes: Uint8Array
  readonly file: string
}

const NO_SESSION = 'Import session not found'

const noArchive = (at: string): string =>
  `This session stages no file at "${at}", so there is nothing to expand. Upload the archive first.`

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
 * The session's `openedAt`, its running byte total and the paths it has staged live in a small
 * marker file rather than in this process, because a chunked upload straddles requests and a
 * restart between two of them must not lose the accounting — and because a sweep measured against
 * filesystem mtimes could only be tested by touching them, which is a case that gets skipped on
 * one platform.
 *
 * The path list is what lets a bad path be answered as a 422 instead of a 500 (see `append`), and
 * what it costs is **CPU inside the write lock**, once per chunk, growing with the number of
 * distinct files the session holds. Measured on win32 / Node 22.16 at fifty thousand staged paths —
 * which is what `MAX_SESSION_BYTES` admits at two kilobytes a file, so it is reachable — the marker
 * is 2.5 MB and its JSON round trip is 4.3 ms to read and 6.9 ms to write, and
 * `assertNoCollisionWith` over it is 3.4 ms. The whole of that runs inside `lock.run`, the
 * process-wide write lock, so it is time every other write in the API waits for; at the ten
 * thousand paths a large migration would actually hold it is around 3 ms in total. The set form of
 * the collision check cost 310 ms per chunk at the same size, which is why `append` does not use
 * it. Against the volume ADR 0044 measures — two files, 8,608 bytes — the list is two lines.
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
   * A session directory whose marker `readMarker` cannot read is swept too, on every one of the
   * grounds that function states — including a marker carrying no `paths` list, which is what a
   * marker written before this class recorded them looks like. Sweeping such a session is the safe
   * direction: read instead as a session that has staged nothing, the next upload into it would
   * have no record of what already sits under `files/` to check a path against, and the 500 that
   * record exists to remove would be reachable again.
   *
   * Such a directory cannot be a session mid-open, because the marker is the first thing written
   * and the lock is held while it is, so it is either debris from an interrupted write or
   * something this API did not put there.
   */
  async open(): Promise<StagedSession> {
    return this.#deps.lock.run(async () => {
      await this.#sweep()
      const sessionId = this.#deps.ids.entityId()
      const openedAt = this.#deps.clock.now()
      await this.#write(sessionId, { openedAt, bytes: 0, paths: [] })
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
   *
   * The path is also checked against the paths this session has already staged, which is what
   * `assertNoCollisionWith` is for and why the marker lists them: a drop holding both `a` and `a/b`
   * as files reaches `appendBytes` on a path whose parent is a file, and that is a fault the port
   * requires be left alone rather than caught. Answering it here makes it the 422 it always was,
   * and in the one-arrival form, because this is the only place that pays it per chunk.
   */
  async append(sessionId: string, harvested: string, bytes: Uint8Array): Promise<StagedChunk> {
    const at = normaliseImportPath(harvested)
    const file = stagedFile(this.#root(), PRODUCT, sessionId, at)
    return this.#deps.lock.run(async () => {
      const marker = await this.#read(sessionId)
      if (marker === null) throw new NotFound(NO_SESSION)
      assertNoCollisionWith(marker.paths, at)
      const sessionBytes = marker.bytes + bytes.length
      if (sessionBytes > MAX_SESSION_BYTES) throw new Conflict(full(marker.bytes))
      await this.#deps.fileSystem.appendBytes(file, bytes)
      const paths = including(marker.paths, at)
      await this.#write(sessionId, { openedAt: marker.openedAt, bytes: sessionBytes, paths })
      return { path: at, chunkBytes: bytes.length, sessionBytes }
    })
  }

  /**
   * Expands one staged `.zip` into the session it was uploaded to, and removes the archive.
   *
   * The archive arrives the way every other file does — chunked into `files/` at the path the
   * client named — because a zip is no smaller than the drop it holds and ADR 0044 chunks
   * everything uniformly. So expansion is a second call rather than something the upload could
   * do: the last chunk of an archive looks exactly like the last chunk of a file.
   *
   * What it stages is what the **same folder dropped** would have staged, at the same paths, and
   * then the archive itself is gone — expanded to its entries and removed, its bytes leaving the
   * session's total as theirs join it. That is what makes ADR 0020's convergence real rather than
   * asserted: after this returns there is nothing in the session for a preview to tell apart from
   * a drop, and no second importer to keep in step.
   *
   * Every rule the expansion enforces lives in `archive.ts`. The two rules that are this class's
   * own are here, because the marker is the only thing that knows them: no entry may land on a
   * path the session already stages, and the session's byte cap is measured as each entry is
   * written rather than after the archive is expanded.
   *
   * The archive counts as **staged** for both of those checks, though it is about to be removed,
   * and that is what closes the one hole in removing it late: an entry named `drop.zip/a.json`
   * would otherwise be written while `drop.zip` was still a file underneath it, which is the
   * `ENOTDIR` this whole record exists to answer as a 422. So an entry inside the archive's own
   * path is refused as the pair it is, and an entry naming the archive exactly is refused as the
   * duplicate it is — that one would otherwise be appended to the archive and then deleted with it.
   *
   * It is removed **after** the expansion has passed every rule, so a refused expansion leaves it
   * staged to be re-expanded or abandoned rather than deleting the operator's upload, and
   * **before** the marker is rewritten, so the worst an interruption between the two can leave is
   * a marker naming a file that is gone. That over-counts the session's bytes and refuses one
   * path, which are both the safe direction; the other order would leave a file the marker does
   * not name, and the next upload to that path would append to it. `remove` and not `removeDir`
   * because its kind is established — the bytes above were read from it as a file.
   */
  async expand(sessionId: string, archive: string): Promise<StagedArchive> {
    const at = normaliseImportPath(archive)
    const file = stagedFile(this.#root(), PRODUCT, sessionId, at)
    return this.#deps.lock.run(async () => {
      const marker = await this.#read(sessionId)
      if (marker === null) throw new NotFound(NO_SESSION)
      const bytes = await this.#deps.fileSystem.readBytes(file)
      if (bytes === null) throw new NotFound(noArchive(at))
      return this.#expand(sessionId, { marker, at, bytes, file })
    })
  }

  async #expand(sessionId: string, archive: Archive): Promise<StagedArchive> {
    const held = archive.marker.paths
    const base = archive.marker.bytes - archive.bytes.length
    let added = 0
    const expansion = await expandArchive(
      archive.bytes,
      (paths) => {
        assertFreshPaths(held, paths)
        assertNoCollision([...held, ...paths])
      },
      async (path, content) => {
        if (base + added + content.length > MAX_SESSION_BYTES) throw new Conflict(full(base + added))
        added += content.length
        await this.#stage(sessionId, path, content)
      },
    )
    await this.#deps.fileSystem.remove(archive.file)
    const sessionBytes = base + expansion.bytes
    const paths = [...held.filter((path) => path !== archive.at), ...expansion.paths]
    await this.#write(sessionId, { openedAt: archive.marker.openedAt, bytes: sessionBytes, paths })
    return { archive: archive.at, files: expansion.paths.length, bytes: expansion.bytes, sessionBytes }
  }

  async #stage(sessionId: string, path: string, content: Uint8Array): Promise<void> {
    await this.#deps.fileSystem.appendBytes(stagedFile(this.#root(), PRODUCT, sessionId, path), content)
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

  async #read(sessionId: string): Promise<SessionMarker | null> {
    const at = sessionMarkerFile(this.#root(), PRODUCT, sessionId)
    return readMarker(await this.#deps.fileSystem.readText(at))
  }

  async #write(sessionId: string, marker: SessionMarker): Promise<void> {
    const at = sessionMarkerFile(this.#root(), PRODUCT, sessionId)
    await this.#deps.fileSystem.writeTextAtomic(at, JSON.stringify(marker))
  }

  #root(): string {
    return this.#deps.config.dataDir
  }
}
