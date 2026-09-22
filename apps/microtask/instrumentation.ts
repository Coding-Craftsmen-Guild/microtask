import { appEnv } from '@repo/app-session/env'

type Runtime = { readonly exit?: (code: number) => never }

/**
 * Validates the environment once, when the server boots, and **kills the process** when it is
 * refused, so a bad environment is a crash rather than a container that looks healthy and serves
 * 500s (ADR 0032).
 *
 * This is the one hook Next runs at server start and **not** during `next build`
 * (`registerInstrumentation` returns early in `phase-production-build`), which is why it can do
 * what reading the environment at module level cannot: the build still needs no production
 * secrets.
 *
 * Measured against the standalone server with `COOKIE_SECRET` unset. With no hook at all it logs
 * `Ready`, serves `/login` with a 200, and fails only when someone signs in. Letting the refusal
 * throw out of here was no better: Next logs `An error occurred while loading instrumentation
 * hook`, keeps the process up and answers every request with a 500 — and Docker restarts a
 * container on exit, never on unhealthy, so `restart: unless-stopped` did nothing and the deploy
 * stayed up until a human read the health status. Exiting non-zero is what the orchestrator can
 * see.
 *
 * The message is logged before the exit, and survives it: `process.stderr` is synchronous on a
 * pipe on both Windows and POSIX, which is what a container's captured stderr is.
 *
 * `process` is reached through `globalThis` and never imported, and no `process.env` is read
 * here, so this file adds neither a Node built-in to the Edge bundle nor a second environment
 * reader (ADR 0012, ADR 0027). Where the runtime has no `exit` to call, the refusal is rethrown
 * rather than swallowed.
 */
export function register(): void {
  try {
    appEnv()
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    console.error(`Refusing to serve: ${reason}`)
    const runtime = (globalThis as { process?: Runtime }).process
    if (runtime?.exit === undefined) throw cause
    runtime.exit(1)
  }
}
