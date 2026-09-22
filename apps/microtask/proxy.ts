import { NextResponse, type NextRequest } from 'next/server'
import { open } from '@repo/app-session/crypto'
import { appEnv } from '@repo/app-session/env'
import { LOGIN_PATH, loginPathFor } from '@repo/app-session/next-path'
import { ADMIN_COOKIE, adminFrom } from './lib/principal'
import { isLinkSurface } from './lib/routes'

const NAVIGATIONS = new Set(['GET', 'HEAD'])

const holdsAdminCookie = (request: NextRequest): boolean => {
  const raw = request.cookies.get(ADMIN_COOKIE)?.value ?? ''
  const opened = raw === '' ? null : open(appEnv().cookieSecret, raw)
  return opened !== null && adminFrom(opened) !== null
}

const isApiRoute = (pathname: string): boolean => pathname === '/api' || pathname.startsWith('/api/')

const isUngated = (pathname: string): boolean =>
  pathname === LOGIN_PATH || isLinkSurface(pathname) || isApiRoute(pathname)

/**
 * The gate in front of every page navigation. It reads `mt_admin` and writes nothing.
 *
 * `proxy.ts` rather than the plan's `middleware.ts`: Next 16.3.4 deprecates the `middleware` file
 * convention in favour of `proxy` (the build warns and names the codemod), and runs a proxy on
 * the Node runtime. The behaviour is the same file under its current name (ADR 0032).
 *
 * **It never sets or clears a cookie**, because a `GET` must not change state. Next prefetches
 * every `<Link>` it renders and another site can link here at top level, so a clear on a `GET` of
 * `/login` would sign an admin out for having a link to it on screen. Nor would one buy
 * anything: `mt_admin` expires with its bearer, and the client surface has no cookie to go stale,
 * because its credential is its URL (ADR 0040). Sign-out is a `POST`, which is where a clear
 * belongs.
 *
 * **It checks that `mt_admin` opens, never that the bearer inside it is still accepted.** A
 * cookie that is tampered, sealed under a rotated secret, or holds a link principal is treated
 * exactly as no cookie — the same 307 to `/login?next=` — because ADR 0032 says a cookie that will
 * not open is *absent*, and a presence check made it a pass to render the admin surface. A cookie
 * that opens but wraps a bearer the API no longer accepts still passes, and meets its 401 in the
 * page, which redirects to `/login` through `lib/problem.ts`: only the API can judge a bearer.
 *
 * Three rules, in order, and only for `GET`/`HEAD`. A `POST` is a Server Action posting to the
 * page it was rendered on, and it answers with its own remedy.
 *
 * 1. `/login` passes. Gating it would send it to `/login?next=/login`, which is itself, forever.
 * 2. The client surface (`/s/*`, `/share/*`, which includes the terminal page) and `/api/*` pass,
 *    and the client surface is **never** sent to `/login`: a client has no password, and a
 *    password form is the worst answer a revoked link can get.
 * 3. Everything else is the admin surface, and a navigation with no `mt_admin` that opens goes to
 *    `/login?next=<path>` — the deep link the app being replaced lost on every expiry.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  if (!NAVIGATIONS.has(request.method) || isUngated(pathname)) return NextResponse.next()
  if (holdsAdminCookie(request)) return NextResponse.next()
  return NextResponse.redirect(new URL(loginPathFor(`${pathname}${search}`), request.url))
}

/** Every path except the build's own static assets and `public/img`, which no session gates. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img/).*)'],
}
