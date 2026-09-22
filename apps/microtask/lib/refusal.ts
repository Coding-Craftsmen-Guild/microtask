import type { RefusalCopy } from '@repo/app-session/refusal'
import type { PrincipalKind } from './principal'

export { plainRefusal } from '@repo/app-session/refusal'
export type { RefusalCopy } from '@repo/app-session/refusal'

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
 *
 * The sentences are here and the status-to-field mapping is not: every one of them names this
 * product, and Macroplan writes its own (ADR 0014).
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
