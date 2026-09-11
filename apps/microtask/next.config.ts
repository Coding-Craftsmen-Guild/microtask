import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * What every response on the client surface carries, because every URL on it holds a live share
 * token (ADR 0040).
 *
 * - `Referrer-Policy: no-referrer`, so a page at `/s/<token>` that links or loads anything off
 *   this origin does not send its own URL — token included — in the `Referer`.
 * - `Cache-Control: private, no-store`, so no shared cache stores one client's page and hands it
 *   to the next, and no browser keeps a copy on disk.
 * - `X-Robots-Tag: noindex, nofollow`, which reaches what a `<meta>` cannot: route handlers,
 *   redirects, and a 404 rendered outside the `/s/` layout (ADR 0037).
 */
export const LINK_SURFACE_HEADERS = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'private, no-store' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
] as const

/**
 * The path patterns those headers apply to: the client surface and its legacy spelling.
 *
 * `/:path*` matches zero or more segments, so each pattern also covers its bare root.
 */
export const LINK_SURFACE_SOURCES = ['/s/:path*', '/share/:path*'] as const

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(here, '..', '..'),
  headers: () =>
    Promise.resolve(LINK_SURFACE_SOURCES.map((source) => ({ source, headers: [...LINK_SURFACE_HEADERS] }))),
}

export default config
