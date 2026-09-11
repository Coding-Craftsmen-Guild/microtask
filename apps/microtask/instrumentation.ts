import { appEnv } from './lib/env'

/**
 * Validates the environment once, when the server boots, so a missing or short secret is a boot
 * failure rather than a runtime one (ADR 0032).
 *
 * This is the one hook Next runs at server start and **not** during `next build`
 * (`registerInstrumentation` returns early in `phase-production-build`), which is why it can do
 * what a module-level `readEnv(process.env)` cannot: the build still needs no production secrets.
 *
 * Measured against the standalone server with `COOKIE_SECRET` unset. Without this hook it logs
 * `Ready`, serves `/login` with a 200, and fails only when someone signs in. With it, boot logs
 * `Failed to prepare server … COOKIE_SECRET is required` and every request is a 500. Next does
 * not exit the process on a failed `register`, so a health check is what turns that into a failed
 * deploy, but nothing is served from a half-configured app.
 */
export function register(): void {
  appEnv()
}
