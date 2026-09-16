import { plainRefusal, type RefusalCopy } from '../../lib/refusal'

const TOO_LARGE = 413

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g

/** What the upload route refused one chunk with, read off the problem document it answered. */
export interface RefusedUpload {
  /** The HTTP status, which is what the admin's remedy differs by. */
  readonly status: number

  /** The stable code, for a log rather than for the screen. */
  readonly code: string

  /** The cap a 413 named, or `null` for every other refusal and for a 413 that named none. */
  readonly maxBytes: number | null
}

/**
 * One chunk the upload route refused, carrying what the admin's remedy depends on.
 *
 * An `Error` subclass so `uploadFiles` catches it per file like anything else that rejects, and
 * so a rejection carries a stack. It deliberately does **not** carry the route's `detail`: that
 * sentence is written for whoever reads the API, and what the admin reads is
 * {@link uploadRefusalText} below.
 */
export class RefusedUploadError extends Error {
  /** What was refused, and how. */
  readonly refusal: RefusedUpload

  /** Builds the error from the problem document the route answered. */
  constructor(refusal: RefusedUpload) {
    super(`${String(refusal.status)} ${refusal.code}`)
    this.name = 'RefusedUploadError'
    this.refusal = refusal
  }
}

/** A byte count with thousands separators, so `1000000` reads as a number and not as a blur. */
export const groupedBytes = (bytes: number): string => String(bytes).replace(THOUSANDS, ',')

/**
 * What the import surface says for each kind of refusal, admin-only and so one set rather than two.
 *
 * Each sentence says what the admin can do about it, because every one of these has a different
 * remedy and "something went wrong" has none: a 409 is either a session that filled or an offset
 * that is not where the file ends, and both mean start the drop again; a 404 is a session that
 * expired or was swept while the admin was reading the preview (ADR 0045).
 */
export const UPLOAD_REFUSALS: RefusalCopy = {
  unauthorised: 'This browser is no longer signed in as the admin. Sign in again, then drop the folder once more.',
  forbidden: 'Microtask refused this upload. Importing is an admin-only action.',
  missing: 'This import session is no longer there. It expired or was swept; drop the folder again.',
  conflict: 'This import session could not take this file. Start the drop again.',
  tooLarge: 'This file is too large for one upload.',
  invalid: 'Microtask could not accept this file. Its path may not be one an import can read.',
  busy: 'Microtask is busy. Drop the folder again in a moment.',
  broken: 'Microtask could not upload this file. Try the drop again in a moment.',
}

const chunkCap = (maxBytes: number): string =>
  `This file is too large for one upload: an import accepts at most ${groupedBytes(maxBytes)} bytes at a time.`

/**
 * The sentence to show against one file the upload refused.
 *
 * A **413 names the cap** rather than saying "too large", taken from the problem document's
 * `maxBytes` extension, which the route forwards from the API's own. Two things that sentence is
 * and is not evidence of, because `body-limits.ts` draws the distinction and it matters here:
 * `maxBytes` is what catches a cap that was *loosened*, since a wrong number produces a wrong
 * sentence; it says nothing about which limiter produced the 413, so a 413 arriving with no
 * `maxBytes` at all — a proxy's own refusal, or a limiter that was removed rather than widened —
 * falls back to the plain sentence rather than inventing a number.
 *
 * Anything that is not a {@link RefusedUploadError} — a dead socket, a body the contract schema
 * refused — is the `broken` sentence. Never an empty string: a file with no row and no reason is
 * the silent short harvest ADR 0018 exists to prevent.
 *
 * @param reason - Whatever rejected the file's upload.
 * @returns One sentence, always non-empty.
 */
export const uploadRefusalText = (reason: unknown): string => {
  if (!(reason instanceof RefusedUploadError)) return UPLOAD_REFUSALS.broken
  const { status, maxBytes } = reason.refusal
  if (status === TOO_LARGE && maxBytes !== null) return chunkCap(maxBytes)
  return plainRefusal(status, UPLOAD_REFUSALS)
}
