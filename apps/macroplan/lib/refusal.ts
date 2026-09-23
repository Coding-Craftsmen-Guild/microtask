import type { RefusalCopy } from '@repo/app-session/refusal'
import type { PrincipalKind } from './principal'

export { plainRefusal } from '@repo/app-session/refusal'
export type { RefusalCopy } from '@repo/app-session/refusal'

const ADMIN: RefusalCopy = {
  unauthorised: 'This browser is not signed in as the admin.',
  forbidden: 'You are not allowed to make that change.',
  missing: 'That is no longer there. Someone may have deleted it; reload the page to see what is.',
  conflict: 'Someone else changed this at the same time. Reload the page and try again.',
  tooLarge: 'That is too large for Macroplan to store.',
  invalid: 'Macroplan did not accept that. A name may be empty, or a limit reached.',
  busy: 'Macroplan is busy. Try again in a moment.',
  broken: 'Macroplan could not complete that. Try again in a moment.',
}

/**
 * What a Server Action's refusal says on each of this app's two surfaces.
 *
 * The API's own `detail` is written for whoever reads the API — `Not permitted: plan:rename` — and
 * in front of either audience it names an internal action rather than saying what happened. So the
 * sentence comes from the status alone, and the API's own wording stays in the log trail.
 *
 * A 401 never reaches the screen from an action — it redirects, to `/login` or to
 * `/s/unavailable` — so its sentence is here for completeness. The two surfaces differ on exactly
 * the two fields an audience changes the meaning of: a plan seat has no password to be signed in
 * with, and a seat refused an action was more likely re-roled under an open page than mistaken
 * (ADR 0032, ADR 0053). The mapping from a status to one of these fields is shared with Microtask;
 * the sentences are not, because every one of them names a product (ADR 0014).
 */
export const ACTION_REFUSALS: Readonly<Record<PrincipalKind, RefusalCopy>> = {
  admin: ADMIN,
  link: {
    ...ADMIN,
    unauthorised: 'This share link is no longer available.',
    forbidden:
      'This link does not allow that. Its access may have changed, so reload the page to see what it can do now.',
  },
}
