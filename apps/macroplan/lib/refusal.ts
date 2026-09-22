import type { RefusalCopy } from '@repo/app-session/refusal'

export { plainRefusal } from '@repo/app-session/refusal'
export type { RefusalCopy } from '@repo/app-session/refusal'

/**
 * What a Server Action's refusal says on this app's one surface.
 *
 * The API's own `detail` is written for whoever reads the API — `Not permitted: plan:write` — and
 * in front of an admin it names an internal action rather than saying what happened. So the
 * sentence comes from the status alone, and the API's own wording stays in the log trail.
 *
 * A 401 never reaches the screen from an action — it redirects to `/login` — so its sentence is
 * here for completeness. The mapping from a status to one of these fields is shared with
 * Microtask; the sentences are not, because every one of them names a product (ADR 0014).
 */
export const ACTION_REFUSALS: RefusalCopy = {
  unauthorised: 'This browser is not signed in as the admin.',
  forbidden: 'You are not allowed to make that change.',
  missing: 'That is no longer there. Someone may have deleted it; reload the page to see what is.',
  conflict: 'Someone else changed this at the same time. Reload the page and try again.',
  tooLarge: 'That is too large for Macroplan to store.',
  invalid: 'Macroplan did not accept that. A name may be empty, or a limit reached.',
  busy: 'Macroplan is busy. Try again in a moment.',
  broken: 'Macroplan could not complete that. Try again in a moment.',
}
