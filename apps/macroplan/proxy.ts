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

/**
 * The gate in front of every page navigation. It reads `mp_admin` on the admin surface, reads no
 * cookie at all on `/s/*`, and writes nothing anywhere.
 *
 * `proxy.ts` rather than `middleware.ts`: Next 16.3.4 deprecates the `middleware` file convention
 * in favour of `proxy` (the build warns and names the codemod), and runs a proxy on the Node
 * runtime (ADR 0032).
 *
 * **It never sets or clears a cookie**, because a `GET` must not change state. Next prefetches
 * every `<Link>` it renders and another site can link here at top level, so a clear on a `GET` of
 * `/login` would sign an admin out for having a link to it on screen. Nor would one buy anything:
 * `mp_admin` expires with its bearer. Sign-out is a `POST`, which is where a clear belongs.
 *
 * **It checks that `mp_admin` opens, never that the bearer inside it is still accepted.** A
 * cookie that is tampered, sealed under a rotated secret, or holds a payload of another kind is
 * treated exactly as no cookie — the same 307 to `/login?next=` — because ADR 0032 says a cookie
 * that will not open is *absent*, and a presence check would be a pass to render the admin
 * surface. A cookie that opens but wraps a bearer the API no longer accepts still passes, and
 * meets its 401 in the page, which redirects to `/login` through `lib/problem.ts`: only the API
 * can judge a bearer.
 *
 * Three rules, in order, and only for `GET`/`HEAD`. A `POST` is a Server Action posting to the page
 * it was rendered on, and it answers with its own remedy.
 *
 * 1. `/login` passes. Gating it would send it to `/login?next=/login`, which is itself, forever.
 * 2. `/s/*` passes, **before** the cookie is read. A share token authenticates from the URL it
 *    arrived in and there is no cookie behind it (ADR 0040), so `mp_admin` decides nothing there:
 *    a plan seat holds no password and an admin who opens a seat's link sees what the seat sees.
 *    Gating it would also route the token itself into `?next=<path>` — a live credential in the
 *    query string of a login URL, which lands in browser history, in that page's own server logs
 *    and in the `Referer` of whatever its form posts to. That is the leak ADR 0013 names for a
 *    credential in a URL, and ADR 0032 adds the other half: a holder with no password must never
 *    be answered with a password form, so a dead link's answer is `/s/unavailable` and never
 *    `/login`.
 * 3. Everything else is the admin surface, and a navigation with no `mp_admin` that opens goes to
 *    `/login?next=<path>`, carrying the deep link.
 *
 * `/api/*` is **still** gated, and rule 2 is the only exemption: a route handler added later has
 * to say so here rather than be exempt by default.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  if (!NAVIGATIONS.has(request.method) || pathname === LOGIN_PATH) return NextResponse.next()
  if (isLinkSurface(pathname)) return NextResponse.next()
  if (holdsAdminCookie(request)) return NextResponse.next()
  return NextResponse.redirect(new URL(loginPathFor(`${pathname}${search}`), request.url))
}

/** Every path except the build's own static assets and `public/img`, which no session gates. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img/).*)'],
}
