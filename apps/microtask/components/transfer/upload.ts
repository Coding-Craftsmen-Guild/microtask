import type { HarvestedFile } from '@repo/ui/transfer/vocabulary.js'

/**
 * How many harvested files the browser uploads at once.
 *
 * A named constant rather than a number at the call site, because it is the one knob this whole
 * module exists to provide and a test has to be able to name it. Four, and the reasoning is a
 * pair of bounds rather than a benchmark:
 *
 * - **Above one**, or this is a sequential upload with extra machinery. A real drop is hundreds
 *   of small files — ADR 0044 measured the live volume at 8,608 bytes across two, and a migration
 *   from the app being replaced is a `projects/` directory of them — and each is one round trip
 *   whose latency dominates its bytes.
 * - **Small and fixed**, because every one of these requests lands on an API that is deliberately
 *   **one replica** (ADR 0030): `QueueLock` is per-process, and each upload takes it. Concurrency
 *   past the point where the lock serialises them buys nothing and only deepens the queue in
 *   front of every other request the admin's own page is making.
 *
 * Chunks *within* one file are never concurrent — they are appended in sequence at an offset the
 * browser tracks — so this bounds files, not requests per file (ADR 0044).
 */
export const UPLOAD_CONCURRENCY = 4

/** What became of one harvested file: staged, or refused with the reason to show against it. */
export type FileOutcome =
  | {
      /** The harvested path, which is how the row joins the list the panel rendered. */
      readonly path: string

      /** Staged. */
      readonly ok: true
    }
  | {
      /** The harvested path the failure was about. */
      readonly path: string

      /** Refused. */
      readonly ok: false

      /** Whatever rejected: a `RefusedUploadError`, or anything else that went wrong. */
      readonly reason: unknown
    }

const settled = async (
  file: HarvestedFile,
  send: (file: HarvestedFile) => Promise<unknown>,
): Promise<FileOutcome> => {
  try {
    await send(file)
    return { path: file.path, ok: true }
  } catch (reason) {
    return { path: file.path, ok: false, reason }
  }
}

/**
 * Uploads every harvested file, at most {@link UPLOAD_CONCURRENCY} of them in flight at once.
 *
 * The bound is enforced by **pulling**: a fixed number of workers take the next unclaimed index
 * and nothing starts a file until a worker is free. The obvious alternative —
 * `Promise.all(files.map(send))` — has no bound at all and starts every file in a drop
 * simultaneously, which is the implementation this module's test is written to fail.
 *
 * **Every file is reported, and one refusal does not end the session.** A rejection is caught per
 * file and becomes that file's own outcome, so a drop where one file could not be read still
 * stages the rest and the admin sees which one it was. Swallowing it instead — or letting it
 * reject the whole run — is the ADR 0018 failure this phase exists to close: a drop that reports
 * fewer files than it contained, with nothing saying which went missing.
 *
 * Outcomes come back **in the order the files were given**, not in the order they finished, so a
 * row can be matched against the list the panel already rendered.
 *
 * @param files - Everything the drop or the picker harvested.
 * @param send - Stages one file, chunk by chunk; rejects if any chunk of it is refused.
 * @param limit - The bound. Defaults to {@link UPLOAD_CONCURRENCY}; a caller passes one only in a test.
 * @returns One outcome per file, in the input's order.
 */
export async function uploadFiles(
  files: readonly HarvestedFile[],
  send: (file: HarvestedFile) => Promise<unknown>,
  limit: number = UPLOAD_CONCURRENCY,
): Promise<readonly FileOutcome[]> {
  const outcomes = new Array<FileOutcome>(files.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      const file = files[index]
      if (file === undefined) return
      outcomes[index] = await settled(file, send)
    }
  }
  const lanes = Math.max(1, Math.min(limit, files.length))
  await Promise.all(Array.from({ length: lanes }, () => worker()))
  return outcomes
}
