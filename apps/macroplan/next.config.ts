import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * What every response on the link surface carries, because every URL on it holds a live share
 * token and there is no cookie behind it (ADR 0040).
 *
 * - `Referrer-Policy: no-referrer`, so a page at `/s/<token>` that links or loads anything off
 *   this origin does not send its own URL — token included — in the `Referer`.
 * - `Cache-Control: private, no-store`, so no shared cache stores one seat's page and hands it to
 *   the next. It is load-bearing rather than belt-and-braces: ADR 0040 measured a prerendered
 *   `/s/unavailable` being served with `s-maxage=31536000` without it.
 * - `X-Robots-Tag: noindex, nofollow`, which reaches what the `robots` meta of an `/s/` layout
 *   cannot (ADR 0037): route handlers, redirects, and a 404 rendered outside that layout.
 *
 * They are set here and not in `proxy.ts`, because a header list is not authority and the proxy's
 * contract is narrow: it reads `mp_admin`, gates admin navigations, and writes nothing (ADR 0040).
 */
export const LINK_SURFACE_HEADERS = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'private, no-store' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
] as const

/**
 * The one path pattern those headers apply to.
 *
 * `/:path*` matches zero or more segments, so it covers the bare `/s` as well as every depth under
 * it. There is deliberately no second pattern: Microtask carries `/share/:path*` for the links
 * already in clients' hands, which ADR 0037 308s to `/s/*`, and this app has circulated no such
 * URL — a source matching nothing would read as protection that is not there.
 */
export const LINK_SURFACE_SOURCES = ['/s/:path*'] as const

/**
 * The build this app deploys as: a standalone server, traced from the repository root.
 *
 * `outputFileTracingRoot` is the monorepo root and not this directory, because the files a
 * standalone build must copy live in the workspace's shared `node_modules` and in
 * `packages/*`. Left to infer it, Next picks the nearest directory holding a lockfile, and a
 * stray non-pnpm lockfile anywhere above would move it silently — which is why ADR 0026 forbids
 * one. The server then starts from its **nested** path, `node apps/macroplan/server.js`.
 */
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(here, '..', '..'),
  headers: () =>
    Promise.resolve(LINK_SURFACE_SOURCES.map((source) => ({ source, headers: [...LINK_SURFACE_HEADERS] }))),
}

export default config
