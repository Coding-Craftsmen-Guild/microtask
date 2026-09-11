import process from 'node:process'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { readConfig } from './config.js'
import { onStopSignal } from './lifecycle.js'
import { buildRuntimeDeps, warmTokenIndex } from './runtime.js'

const WEAK_PASSWORD = 8

/**
 * The one file in this app that reads the environment, and the only one that calls `serve()`.
 *
 * **Nothing imports it.** An emit script that transitively reaches a module calling `serve()` at
 * module scope wrote its file and then never exited, because the listening socket holds the event
 * loop open — so `scripts/emit-openapi.ts` imports `app.js`, and everything this file needs
 * beyond the environment lives in `runtime.ts` where a test can reach it.
 *
 * `readConfig` is a pure function of the object handed to it, which is what keeps every
 * configuration rule testable and `n/no-process-env` satisfied everywhere else; the lint config
 * lifts that rule for this file alone, so "which file reads the environment" is answered by
 * `apps/api/eslint.config.js` rather than by a comment.
 *
 * `autoCleanupIncoming` is deliberately not passed. Its default of `true` is what closes a socket
 * whose body the credential guard refused before reading, and overriding it would leak
 * connections from exactly the requests least worth keeping.
 *
 * A short admin password warns rather than refuses: the app being replaced starts on one, and
 * turning that into a hard failure would lock out a deployment that works today.
 *
 * `onStopSignal` is installed here and nowhere else, because this is the file that owns the
 * listening socket. Without it `docker stop` waited out its grace period and SIGKILLed, which can
 * land inside a write window (ADR 0006); the stop it installs drains the server and exits 0, and
 * says so in the log, the way the app being replaced did.
 */
export async function main(): Promise<void> {
  const config = readConfig(process.env)
  if (config.adminPassword.length < WEAK_PASSWORD) {
    console.warn(`ADMIN_PASSWORD is shorter than ${String(WEAK_PASSWORD)} characters`)
  }
  const deps = buildRuntimeDeps(config)
  const shareTokensIndexed = await warmTokenIndex(deps)
  const server = serve({ fetch: createApp(deps).fetch, port: config.port }, (info) => {
    console.log(
      JSON.stringify({
        event: 'api.listening',
        port: info.port,
        dataDir: config.dataDir,
        shareTokensIndexed,
      }),
    )
  })
  onStopSignal(server, (code) => {
    console.log(JSON.stringify({ event: 'api.stopped', code }))
    process.exit(code)
  })
}

await main()
