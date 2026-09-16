import type { ChunkRef } from '@repo/api-client'
import type { HarvestedFile } from '@repo/ui/transfer/vocabulary.js'
import type { StagedChunk } from './post-chunk'

const ARCHIVE = '.zip'

/** Where a file's chunks are staged, and how large each one may be. */
export interface ChunkTarget {
  /** The staged session every chunk of this file is appended into. */
  readonly sessionId: string

  /** The cap the **server** answered when the session was opened, which is what slicing obeys. */
  readonly maxChunkBytes: number

  /** Sends one chunk and answers what it staged. */
  readonly send: (ref: ChunkRef, bytes: Blob) => Promise<StagedChunk>
}

/** One harvested file as the session now holds it. */
export interface StagedFile {
  /**
   * The path the **server** staged it at, which is not always the one that was sent.
   *
   * The server re-runs its own normaliser on whatever arrives, so `a//./b` is staged at `a/b`. A
   * caller that went on addressing its own spelling — asking for an archive to be expanded, say —
   * would be naming a file the session does not hold.
   */
  readonly path: string

  /** How many bytes were staged, which is the file's size. */
  readonly bytes: number
}

const miscounted = (path: string, sent: number, counted: number): Error =>
  new Error(
    `the server counted ${String(counted)} bytes of ${path} where ${String(sent)} were sent`,
  )

/**
 * Stages one harvested file, in sequence, tracking its **own** offset as it goes.
 *
 * The offset is the whole of this function. The API's upload route requires it and defaults
 * nothing, for a reason its own record states: a default of "wherever the file ends" had a client
 * that retried after a timeout append the same bytes twice, doubling the session's total and
 * pushing a legitimate drop into the session cap for no reason the operator could see. So the
 * browser is the authority on where the next chunk goes — one counter per file, advanced only by
 * bytes the server confirms it staged — and the server refuses a 409 naming the offset to resume
 * from when the two disagree (ADR 0044).
 *
 * The answered `chunkBytes` is compared against the slice that was sent rather than merely read,
 * which is the check that field exists to make possible. A disagreement rejects the **file**:
 * advancing by the server's number would resume from an offset that matches neither side, and
 * advancing by the slice's would leave a hole in the staged file that no later check could see.
 *
 * Chunks go one after another and never concurrently, because they are appends to one file at a
 * stated offset. The bounded concurrency in `upload.ts` applies across *files*.
 *
 * A **zero-byte file still sends one chunk.** The loop is a `do`/`while` rather than a `while`
 * exactly for that: an empty file is a real thing to drop, and a client that sent nothing for it
 * would stage no file at all — a drop reporting fewer files than it contained, which is the
 * failure ADR 0018 was written about. The API's `append` creates the staging file from a
 * zero-length write, so the empty chunk is what makes it exist.
 *
 * @param file - The harvested file and the path it was dropped under.
 * @param into - The session, its chunk cap, and the sender.
 * @returns The path the server staged it at, and how many bytes that is.
 */
export async function stageFile(file: HarvestedFile, into: ChunkTarget): Promise<StagedFile> {
  const { size } = file.file
  let offset = 0
  let at = file.path
  do {
    const slice = file.file.slice(offset, offset + into.maxChunkBytes)
    const ref: ChunkRef = { sessionId: into.sessionId, path: file.path, offset }
    const staged = await into.send(ref, slice)
    if (staged.chunkBytes !== slice.size) throw miscounted(file.path, slice.size, staged.chunkBytes)
    at = staged.path
    offset += staged.chunkBytes
  } while (offset < size)
  return { path: at, bytes: offset }
}

/**
 * Whether a harvested path names an archive this app asks the **server** to expand.
 *
 * By extension and nothing else, because the browser never opens one: `Blob.slice()` is byte
 * slicing and knows nothing of zip structure, and the hardening an untrusted archive needs cannot
 * be trusted to a client (ADR 0020). A file whose name says `.zip` and whose bytes are not an
 * archive is the server's 422, not a guess made here.
 *
 * @param path - The harvested path.
 * @returns Whether to ask for an expansion once it is staged.
 */
export const isArchive = (path: string): boolean => path.toLowerCase().endsWith(ARCHIVE)
