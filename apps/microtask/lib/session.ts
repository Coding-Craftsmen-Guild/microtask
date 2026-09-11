import { cookies, headers } from 'next/headers'
import { appEnv } from './env'
import { secureFrom, sessionCookies, type CookieJar, type SessionCookies } from './session-store'

/**
 * Binds {@link sessionCookies} to this request's cookie jar, headers and `COOKIE_SECRET`.
 *
 * The adapter around Next's store is explicit rather than structural so the port stays the
 * narrow thing the tests drive: two methods, no request scope, no framework.
 *
 * **Reads are safe anywhere; seals and clears are not.** Next refuses a cookie write during a
 * Server Component render, so `sealAdmin` and `clearAdmin` may only be called from a Server Action
 * or a Route Handler — in this app, `signIn` and `signOut`. That is not this app's rule to relax,
 * and it is why a 401 found during a render *redirects* to `/login?next=` and clears nothing:
 * `proxy.ts` writes no cookie on any request, and the next sign-in overwrites the stale one
 * (ADR 0032).
 *
 * Only the admin surface calls this. A `/s/*` route takes its credential from its URL and never
 * asks for a session at all (ADR 0040).
 */
export async function session(): Promise<SessionCookies> {
  const store = await cookies()
  const jar: CookieJar = {
    get: (name) => store.get(name),
    set: (cookie) => {
      store.set(cookie)
    },
  }
  const secure = secureFrom((await headers()).get('x-forwarded-proto'))
  return sessionCookies({ jar, secret: appEnv().cookieSecret, secure })
}
