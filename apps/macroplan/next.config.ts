import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The build this app deploys as: a standalone server, traced from the repository root.
 *
 * `outputFileTracingRoot` is the monorepo root and not this directory, because the files a
 * standalone build must copy live in the workspace's shared `node_modules` and in
 * `packages/*`. Left to infer it, Next picks the nearest directory holding a lockfile, and a
 * stray non-pnpm lockfile anywhere above would move it silently — which is why ADR 0026 forbids
 * one. The server then starts from its **nested** path, `node apps/macroplan/server.js`.
 *
 * There are no `headers`. Microtask sets `no-referrer` and `noindex` over `/s/*` because every
 * URL there holds a live share token (ADR 0040); this app has no such surface, and a header rule
 * matching nothing would read as protection that is not there.
 */
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(here, '..', '..'),
}

export default config
