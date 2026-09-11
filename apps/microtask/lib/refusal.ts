import type { PrincipalKind } from './principal'

/**
 * One plain sentence per kind of refusal, for one surface.
 *
 * The API's own `detail` is written for whoever reads the API — `Not permitted: tab:write`, `The
 * bearer token does not name anyone.` — and reaching a client verbatim it names an internal
 * action to someone who asked to tick a box. So the app picks what the user reads, per surface,
 * from the status alone, and the API's sentence stays in the problem document's log trail.
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

const ACTIONS = {
  missing: 'That is no longer there. Someone may have deleted it; reload the page to see what is.',
  conflict: 'Someone else changed this at the same time. Reload the page and try again.',
  tooLarge: 'That is too large for Microtask to store.',
  invalid: 'Microtask did not accept that. A name may be empty, or a limit reached.',
  busy: 'Microtask is busy. Try again in a moment.',
  broken: 'Microtask could not complete that. Try again in a moment.',
} as const

/**
 * What a Server Action's refusal says on each surface. A 401 never reaches the screen from an
 * action — it redirects, to `/login` or to `/s/unavailable` — so its sentence is there for
 * completeness. The link surface's 403 says what legacy's `This link is read-only` meant, widened
 * for a role that has three values: the link's access changed under an open page.
 */
export const ACTION_REFUSALS: Readonly<Record<PrincipalKind, RefusalCopy>> = {
  admin: {
    ...ACTIONS,
    unauthorised: 'This browser is not signed in as the admin.',
    forbidden: 'You are not allowed to make that change.',
  },
  link: {
    ...ACTIONS,
    unauthorised: 'This share link is no longer available.',
    forbidden: 'This link does not allow that. Its access may have changed, so reload the page to see what it can do now.',
  },
}

const DOCUMENTS = {
  missing: 'This tab is no longer there. Someone may have deleted it.',
  conflict: 'Someone else saved this tab.',
  tooLarge: 'This tab is too large to save. Shorten it, then choose Try again.',
  invalid: 'Microtask could not accept this tab as it stands.',
  busy: 'Microtask is busy, so this tab will be saved shortly.',
  broken: 'Microtask could not save this tab just now.',
} as const

/**
 * What a document save's refusal says on each surface, shown by the editor island under the
 * editor: beside "retrying" for what a retry can outlast, and beside a Try again button for what
 * it cannot (ADR 0016). A link downgraded to view says what legacy said, that the link is
 * read-only; a revoked one says the link is gone.
 */
export const DOCUMENT_REFUSALS: Readonly<Record<PrincipalKind, RefusalCopy>> = {
  admin: {
    ...DOCUMENTS,
    unauthorised:
      'This browser is no longer signed in as the admin. Sign in again in another browser tab, then choose Try again.',
    forbidden: 'Microtask refused to save this tab from here.',
  },
  link: {
    ...DOCUMENTS,
    unauthorised: 'This share link is no longer available, so this tab cannot be saved through it.',
    forbidden: 'This link is read-only now, so this tab cannot be saved through it.',
  },
}
