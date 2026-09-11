import { ApiError } from '@repo/api-client'
import { safeNextPath } from './next-path'
import { SERVICE_UNAVAILABLE } from './problem'
import { LOGIN_PATH } from './routes'

/**
 * The one sentence a refused sign-in ever shows, whichever credential was wrong.
 *
 * The same words the API's own refusal uses, and fixed here rather than copied from the response,
 * so the form cannot start disclosing more if the API's detail ever does.
 */
export const LOGIN_REFUSED = 'The credentials presented were not accepted.'

/** What the sign-in form renders: a message, or nothing while no attempt has failed. */
export interface SignInState {
  /** The sentence to show under the form, or `null` before the first attempt. */
  readonly message: string | null
}

const SERVER_ERROR = 500

/**
 * What a failed sign-in tells the browser.
 *
 * A wrong password and an unknown service key are **indistinguishable** here, and so is every
 * other client-side failure the login route can produce — a 401 of any code, and a 422 for a
 * malformed body. Telling any two of those apart would make this form an oracle: a body
 * distinguishing "your key is unknown" from "your password is wrong" confirms a valid service key
 * to anyone holding a stolen one, and tells a password guesser its other credential is good.
 *
 * A 5xx or an unreachable API is the one distinction kept, because it is not a statement about
 * any credential: a guesser learns only that the API is down, which the next request would show
 * them anyway. Hiding it would tell a real admin their password was wrong during an outage.
 */
export function refusalFor(error: unknown): SignInState {
  if (error instanceof ApiError && error.status < SERVER_ERROR) return { message: LOGIN_REFUSED }
  return { message: SERVICE_UNAVAILABLE }
}

/**
 * Records a refused sign-in as one structured line, for the operator and never for the browser.
 *
 * This is the *app's* half of "distinguishable in the logs". The API answers both refusals with
 * the same document on purpose, so the app cannot tell a wrong password from an unknown service
 * key and does not pretend to — `reportLoginRefusal` in `apps/api` logs which one it was, on the
 * side of the boundary that knows. What this line adds is that a refusal reached *this* app, with
 * the status and code it came back as, so a misconfigured `API_KEY` (every attempt refused) reads
 * differently from a guesser (occasional attempts) and from an outage (status `0` or 5xx).
 *
 * The password is not a parameter, so it cannot reach the line by accident.
 */
export function reportLoginRefusal(error: unknown): void {
  const known = error instanceof ApiError
  console.warn(
    JSON.stringify({
      event: 'auth.login.refused',
      status: known ? error.status : 0,
      code: known ? error.code : 'unreachable',
      instance: known ? error.instance : null,
    }),
  )
}

/**
 * Where a successful sign-in lands: the sanitised `?next=`, or `/`.
 *
 * `/login` itself is refused as a destination, and so is anything under it. `proxy.ts`
 * clears `mt_admin` on every request to `/login`, so a sign-in that redirected there would seal
 * the cookie and have it cleared on the very next response — a login form that appears to accept
 * the password and then asks for it again.
 */
export function signInDestination(next: string | null | undefined): string {
  const safe = safeNextPath(next)
  const path = safe.split(/[?#]/, 1)[0] ?? safe
  return path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`) ? '/' : safe
}
