import { cookies, headers } from 'next/headers'
import { sessionCookies, secureFrom, type CookieJar, type SessionCookies } from './cookies'
import { appEnv } from './env'

/**
 * Binds {@link sessionCookies} to this request's cookie jar, headers and `COOKIE_SECRET`.
 *
 * The adapter around Next's store is explicit rather than structural so the port stays the
 * narrow thing the tests drive: two methods, no request scope, no framework.
 *
 * **Reads are safe anywhere; seals and clears are not.** Next refuses a cookie write during a
 * Server Component render, so `sealAdmin` and `clearAdmin` may only be called from a Server Action
 * or a Route Handler — `signIn` and `signOut` in each app. That is not an app's rule to relax,
 * and it is why a 401 found during a render *redirects* to `/login?next=` and clears nothing:
 * neither app's `proxy.ts` writes a cookie on any request, and the next sign-in overwrites the
 * stale one (ADR 0032).
 *
 * `name` is the caller's, because it is the one thing the two products must not share: Microtask
 * seals `mt_admin` and Macroplan `mp_admin`, so signing into one does not sign the other out
 * (ADR 0014). Only an admin surface calls this. Microtask's `/s/*` routes take their credential
 * from the URL and never ask for a session at all (ADR 0040).
 */
export async function adminSession(name: string): Promise<SessionCookies> {
  const store = await cookies()
  const jar: CookieJar = {
    get: (cookie) => store.get(cookie),
    set: (cookie) => {
      store.set(cookie)
    },
  }
  const secure = secureFrom((await headers()).get('x-forwarded-proto'))
  return sessionCookies({ jar, name, secret: appEnv().cookieSecret, secure })
}
