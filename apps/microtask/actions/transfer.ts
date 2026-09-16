'use server'

import type { Decoded } from '@repo/api-client'
import type {
  ImportConfirmResult,
  ImportExpansion,
  ImportPreview,
  ImportProjectChoice,
  ImportSession,
} from '@repo/contracts'
import { TRANSFER_PAGE_PATH } from '../components/transfer/paths'
import { adminCall, type ActionResult } from './result'

/**
 * Opens a staged import session and answers the caps every upload into it must obey.
 *
 * An action and not a route handler, which is the rule rather than the exception: ADR 0015 is
 * "Server Actions, except anything that moves bytes", and this moves none — it takes no body at
 * all. Only the per-chunk upload and the export download are handlers, and adding a third for
 * this would be the fourth route handler the ADR names three of.
 *
 * `maxChunkBytes` is answered rather than assumed by the browser, because the browser is what
 * slices each file: a client carrying its own copy of that number starts collecting 413s the day
 * the server's changes (ADR 0044).
 */
export async function openImportSession(): Promise<ActionResult<Decoded<typeof ImportSession>>> {
  return adminCall(TRANSFER_PAGE_PATH, (api) => api.transfer.openSession())
}

/**
 * Expands one already-staged `.zip` into its session, and removes the archive (ADR 0020).
 *
 * The browser never parses an archive — it uploads the bytes like any other file and asks for
 * this — because the hardening an untrusted archive needs cannot be trusted to a client, and a
 * zip parser in two browser bundles is a dependency this product does not want. It is a second
 * call rather than something the upload infers, since the last chunk of an archive is
 * indistinguishable from the last chunk of anything else.
 */
export async function expandImportArchive(
  sessionId: string,
  path: string,
): Promise<ActionResult<Decoded<typeof ImportExpansion>>> {
  return adminCall(TRANSFER_PAGE_PATH, (api) => api.transfer.expandArchive(sessionId, path))
}

/**
 * Reads what a confirm would do with one staged session, group by group. It writes nothing.
 *
 * Every group gets a row, the unreadable ones included, because silent skipping is the failure
 * ADR 0018 was written about — so a preview that comes back short is not something this action
 * may hide, and a refusal comes back as a sentence rather than as an empty table.
 */
export async function previewImport(
  sessionId: string,
): Promise<ActionResult<Decoded<typeof ImportPreview>>> {
  return adminCall(TRANSFER_PAGE_PATH, (api) => api.transfer.preview(sessionId))
}

/**
 * Applies one staged session under the admin's conflict choices.
 *
 * `choices` arrives from the browser and is a **target** for the API to judge, never proof of
 * anything: a Server Action is a public endpoint, so the authority is re-derived from `mt_admin`
 * on every call and the API refuses a choice naming a project this session does not hold. The
 * shape is not re-validated here — `ImportConfirmRequest` is the one authority on it, and a
 * second copy of a rejection rule is the kind of duplication that fails silently.
 *
 * It answers **200 with per-project outcomes, failures included**, and this action passes that
 * through rather than folding it into a success or a failure: a drop is many independent
 * projects, and there is no single word that is true of a confirm where eight landed and one did
 * not. The session is swept either way (ADR 0045), so the rows are the only record of it.
 */
export async function confirmImport(
  sessionId: string,
  choices: readonly Decoded<typeof ImportProjectChoice>[],
): Promise<ActionResult<Decoded<typeof ImportConfirmResult>>> {
  return adminCall(TRANSFER_PAGE_PATH, (api) => api.transfer.confirm({ sessionId, choices }))
}
