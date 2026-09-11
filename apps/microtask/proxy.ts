import { NextResponse, type NextRequest } from 'next/server'
import { open } from './lib/crypto'
import { appEnv } from './lib/env'
import { loginPathFor } from './lib/next-path'
import { ADMIN_COOKIE, LINK_COOKIE, adminFrom } from './lib/principal'
import { LINK_UNAVAILABLE_PATH, LOGIN_PATH, isLinkSurface } from './lib/routes'
import { clearedCookie, secureFrom } from './lib/session-store'

const NAVIGATIONS = new Set(['GET', 'HEAD'])

const cleared = (name: string, secure: boolean): NextResponse => {
  const response = NextResponse.next()
  response.cookies.set(clearedCookie(name, secure))
  return response
}

const holdsAdminCookie = (request: NextRequest): boolean => {
  const raw = request.cookies.get(ADMIN_COOKIE)?.value ?? ''
  const opened = raw === '' ? null : open(appEnv().cookieSecret, raw)
  return opened !== null && adminFrom(opened) !== null
}

const isApiRoute = (pathname: string): boolean => pathname === '/api' || pathname.startsWith('/api/')

/**
 * The gate in front of every page navigation, and the only code that clears a cookie on one.
 *
 * `proxy.ts` rather than the plan's `middleware.ts`: Next 16.3.4 deprecates the `middleware` file
 * convention in favour of `proxy` (the build warns and names the codemod), and runs a proxy on
 * the Node runtime. The behaviour is the same file under its current name.
 *
 * **It checks that `mt_admin` opens, never that the bearer inside it is still accepted.** A
 * cookie that is tampered, sealed under a rotated secret, or holds a link principal is treated
 * exactly as no cookie — the same 307 to `/login?next=` — because ADR 0032 says a cookie that will
 * not open is *absent*, and a presence check made it a pass to render the admin surface. A cookie
 * that opens but wraps a bearer the API no longer accepts still passes, and meets its 401 in the
 * page, which redirects back to `/login` through `lib/problem.ts`: only the API can judge a
 * bearer, and nothing here tries to.
 *
 * Four rules, in order, and only for `GET`/`HEAD`. A `POST` is a Server Action posting to the
 * page it was rendered on: it answers with its own remedy, and on `/login` it is the sign-in
 * that **seals** `mt_admin` — clearing it in the same response would race the seal.
 *
 * 1. `/login` clears `mt_admin`. Every admin 401 and every sign-out lands there, and a Server
 *    Component that found the 401 cannot clear a cookie itself, so this is where ADR 0032's
 *    "an admin 401 clears `mt_admin`" actually happens.
 * 2. The terminal link page clears `mt_link`, for the same reason and on the same evidence, so a
 *    reload does not re-attempt a dead token. Neither rule touches the other cookie.
 * 3. The client surface (`/s/*`, `/share/*`) passes untouched and is **never** sent to `/login`.
 *    A client has no password, and a password form is the worst answer a revoked link can get.
 * 4. Everything else is the admin surface, and a navigation with no `mt_admin` that opens goes to
 *    `/login?next=<path>` — the deep link the app being replaced lost on every expiry.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  if (!NAVIGATIONS.has(request.method)) return NextResponse.next()
  const secure = secureFrom(request.headers.get('x-forwarded-proto'))
  if (pathname === LOGIN_PATH) return cleared(ADMIN_COOKIE, secure)
  if (pathname === LINK_UNAVAILABLE_PATH) return cleared(LINK_COOKIE, secure)
  if (isLinkSurface(pathname) || isApiRoute(pathname)) return NextResponse.next()
  if (holdsAdminCookie(request)) return NextResponse.next()
  return NextResponse.redirect(new URL(loginPathFor(`${pathname}${search}`), request.url))
}

/** Every path except the build's own static assets, which no session gates. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
