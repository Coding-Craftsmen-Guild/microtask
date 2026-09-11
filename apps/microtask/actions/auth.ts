'use server'

import type { AdminSessionValue } from '@repo/api-client'
import { redirect } from 'next/navigation'
import { loginWith } from '../lib/api'
import {
  LOGIN_REFUSED,
  refusalFor,
  reportLoginRefusal,
  signInDestination,
  type SignInState,
} from '../lib/login'
import { LOGIN_PATH } from '../lib/routes'
import { session } from '../lib/session'

const field = (form: FormData, name: string): string => {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * Exchanges the admin password for a bearer, seals it into `mt_admin`, and follows `?next=`.
 *
 * Every refusal the login route can produce comes back as the **same** state, so the form is not
 * a password oracle; the API logs which credential was wrong, and this action logs that a refusal
 * reached the app (`lib/login.ts`). An empty password is refused without a request, with the same
 * words, so an empty submit is not a probe either.
 *
 * `mt_admin` lives exactly as long as the bearer: its `Max-Age` is the `expiresInSeconds` the API
 * answered with, never a constant, so the cookie cannot outlive the token it wraps (ADR 0032).
 *
 * `redirect` is called after the `try`, never inside it: it works by throwing, and a `catch` that
 * swallowed it would turn every successful sign-in into a refusal.
 */
export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const password = field(form, 'password')
  if (password === '') return { message: LOGIN_REFUSED }
  let issued: AdminSessionValue
  try {
    issued = await loginWith(password)
  } catch (error) {
    reportLoginRefusal(error)
    return refusalFor(error)
  }
  const cookies = await session()
  cookies.sealAdmin(issued.token, issued.expiresInSeconds)
  redirect(signInDestination(field(form, 'next')))
}

/**
 * Ends the admin session in this browser: clears `mt_admin` and lands on `/login`.
 *
 * **This does not revoke the bearer, and that is a recorded limit rather than an oversight.** The
 * admin token is a self-contained HMAC the API cannot revoke without adding a store, and rotating
 * `SESSION_SECRET` would sign out every admin at once, so there is deliberately no API logout
 * route (ADR 0012's amendment, ADR 0032). Clearing the cookie ends the session in the only browser
 * that held it; a copy of the bearer taken before sign-out stays valid until its own expiry,
 * which `ADMIN_TOKEN_TTL_SECONDS` bounds.
 *
 * No other cookie is touched, and a client's link open in another tab keeps working: the client
 * surface reads no cookie at all (ADR 0040).
 */
export async function signOut(): Promise<void> {
  const cookies = await session()
  cookies.clearAdmin()
  redirect(LOGIN_PATH)
}
