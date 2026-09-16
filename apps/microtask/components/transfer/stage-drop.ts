import type { ChunkRef, Decoded } from '@repo/api-client'
import type { ImportPreview, ImportSession } from '@repo/contracts'
import type { HarvestedFile } from '@repo/ui/transfer/vocabulary.js'
import type { ActionResult } from '../../actions/result'
import { isArchive, stageFile } from './chunks'
import type { StagedChunk } from './post-chunk'
import { uploadRefusalText } from './refusal'
import { uploadFiles } from './upload'

/** One file the drop could not stage, and the sentence to show against it. */
export interface FileFailure {
  /** The harvested path, so the row names the file and not the drop. */
  readonly path: string

  /** Why, in this surface's own words. */
  readonly detail: string
}

/** Everything staging a drop needs, each one injected so this module opens no socket itself. */
export interface DropPorts {
  /** Opens a session and answers the caps the browser slices by. */
  readonly open: () => Promise<ActionResult<Decoded<typeof ImportSession>>>

  /** Posts one chunk of one file. */
  readonly send: (ref: ChunkRef, bytes: Blob) => Promise<StagedChunk>

  /** Asks the server to expand one staged archive (ADR 0020). */
  readonly expand: (sessionId: string, path: string) => Promise<ActionResult<unknown>>

  /** Reads the plan for the staged session. */
  readonly preview: (sessionId: string) => Promise<ActionResult<Decoded<typeof ImportPreview>>>
}

/** What became of a whole drop: a plan to show, or one sentence saying why there is none. */
export type DropOutcome =
  | {
      /** Staged and previewed. */
      readonly ok: true

      /** The session the plan belongs to, which a confirm will name. */
      readonly sessionId: string

      /** The plan, one row per group. */
      readonly preview: Decoded<typeof ImportPreview>

      /** Every file that did not make it, named one by one. */
      readonly failures: readonly FileFailure[]
    }
  | {
      /** Nothing was staged, or nothing could be described. */
      readonly ok: false

      /** The sentence to show in place of a preview. */
      readonly detail: string
    }

const expansions = async (
  archives: readonly string[],
  sessionId: string,
  expand: DropPorts['expand'],
): Promise<readonly FileFailure[]> => {
  const failures: FileFailure[] = []
  for (const path of archives) {
    const expanded = await expand(sessionId, path)
    if (!expanded.ok) failures.push({ path, detail: expanded.detail })
  }
  return failures
}

/**
 * Stages a whole harvested drop and answers the plan for it.
 *
 * Four steps, in the only order they can run in, and each is a decision the ADRs already made:
 * open a session, upload every file under a bound, ask the server to expand whatever was a
 * `.zip`, then read the preview. The browser never opens an archive — `Blob.slice()` is byte
 * slicing and knows nothing of zip structure, and hardening an untrusted archive cannot be
 * trusted to a client (ADR 0020) — so an expansion is a request and not a local step.
 *
 * **A failure is either about one file or about the whole drop, and the two are never confused.**
 * A file that could not be staged, and an archive the server refused to expand, are reported per
 * file: the drop carries on and the preview still describes everything that did land, because a
 * drop of two hundred files that gives up on the seventh is worse than useless to a migration.
 * Only the three calls that are *about the session* — opening it, and previewing it — can end the
 * drop, and each ends it with a sentence rather than with an empty table.
 *
 * Archives are expanded **in sequence**, not concurrently: each expansion is measured against the
 * session's running byte total under the session's own lock, and the API is deliberately one
 * replica (ADR 0030), so parallelism here would only queue.
 *
 * Every archive is expanded at the path **the server** staged it at rather than the one the
 * browser sent, because the server re-normalises what arrives and a client addressing its own
 * spelling would name a file the session does not hold.
 *
 * @param files - Everything the drop or the picker harvested.
 * @param ports - The session, the uploader, the expander and the preview.
 * @returns The plan and the per-file failures, or one sentence saying why there is no plan.
 */
export async function stageDrop(
  files: readonly HarvestedFile[],
  ports: DropPorts,
): Promise<DropOutcome> {
  const opened = await ports.open()
  if (!opened.ok) return { ok: false, detail: opened.detail }
  const { sessionId, maxChunkBytes } = opened.value
  const archives: string[] = []
  const outcomes = await uploadFiles(files, async (file) => {
    const staged = await stageFile(file, { sessionId, maxChunkBytes, send: ports.send })
    if (isArchive(staged.path)) archives.push(staged.path)
  })
  const refused = outcomes.flatMap((one) =>
    one.ok ? [] : [{ path: one.path, detail: uploadRefusalText(one.reason) }],
  )
  const unexpanded = await expansions(archives, sessionId, ports.expand)
  const planned = await ports.preview(sessionId)
  if (!planned.ok) return { ok: false, detail: planned.detail }
  return { ok: true, sessionId, preview: planned.value, failures: [...refused, ...unexpanded] }
}
