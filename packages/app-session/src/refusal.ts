/**
 * One plain sentence per kind of refusal, for one surface.
 *
 * The API's own `detail` is written for whoever reads the API — `Not permitted: tab:write`, `The
 * bearer token does not name anyone.` — and reaching a client verbatim it names an internal
 * action to someone who asked to tick a box. So an app picks what the user reads, per surface,
 * from the status alone, and the API's sentence stays in the problem document's log trail.
 *
 * The shape is here and the sentences are not: every one of them names a product, so each app
 * owns its own tables and shares only the mapping from a status to a field (ADR 0014).
 */
export interface RefusalCopy {
  /** A 401: the credential names nobody any more. */
  readonly unauthorised: string

  /** A 403: the credential is known but may not do this. */
  readonly forbidden: string

  /** A 404: the thing is gone. */
  readonly missing: string

  /** A 409: someone else changed it first. */
  readonly conflict: string

  /** A 413: too large to store. */
  readonly tooLarge: string

  /** A 400, a 422, or any other 4xx: the request itself was not acceptable. */
  readonly invalid: string

  /** A 408 or a 429: the server is busy, and the same request may land later. */
  readonly busy: string

  /** A 5xx, or no answer at all: the server failed, and the same request may land later. */
  readonly broken: string
}

const BY_STATUS: Readonly<Record<number, keyof RefusalCopy>> = {
  401: 'unauthorised',
  403: 'forbidden',
  404: 'missing',
  408: 'busy',
  409: 'conflict',
  413: 'tooLarge',
  429: 'busy',
}

const CLIENT_ERROR = 400

const SERVER_ERROR = 500

/** The sentence `copy` holds for `status`, never anything the API said. */
export function plainRefusal(status: number, copy: RefusalCopy): string {
  const named = BY_STATUS[status]
  if (named !== undefined) return copy[named]
  return status >= CLIENT_ERROR && status < SERVER_ERROR ? copy.invalid : copy.broken
}
