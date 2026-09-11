import process from 'node:process'

/** The environment a config is read from: `process.env`, or a literal object in a test. */
export type Env = Readonly<Record<string, string | undefined>>

/** Everything this app needs from its environment, already validated. */
export interface AppEnv {
  /** Origin the internal API is served from, with or without a trailing slash. */
  readonly apiBaseUrl: string

  /** The `x-api-key` naming this app to the API. It confers no authority (ADR 0012). */
  readonly apiKey: string

  /** Key both session cookies are sealed under, distinct from the API's `SESSION_SECRET`. */
  readonly cookieSecret: string
}

/**
 * The floor on `COOKIE_SECRET`, measured in **bytes** rather than UTF-16 code units.
 *
 * AES-256 takes a 256-bit key, so a secret below this is stretched rather than supplied, and a
 * short key silently weakens every sealed cookie above it. Bytes and not `String.length`
 * because the two disagree outside ASCII in both directions: sixteen `€` are 16 code units and
 * 48 bytes, fifteen `é` are 15 code units and 30 bytes.
 */
export const MIN_COOKIE_SECRET_BYTES = 32

function required(source: Env, key: string): string {
  const raw = source[key]
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`${key} is required — refusing to serve a request without it`)
  }
  return raw
}

function readCookieSecret(source: Env): string {
  const secret = required(source, 'COOKIE_SECRET')
  const bytes = Buffer.byteLength(secret, 'utf8')
  if (bytes < MIN_COOKIE_SECRET_BYTES) {
    throw new Error(
      `COOKIE_SECRET must be at least ${String(MIN_COOKIE_SECRET_BYTES)} bytes, got ${String(bytes)}`,
    )
  }
  return secret
}

/**
 * Validates an environment into an {@link AppEnv}, or throws naming the variable at fault.
 *
 * A pure function of its argument: it reads no `process.env` itself, which is what makes every
 * rule above testable and keeps the single-reader promise below to one line.
 */
export function readEnv(source: Env): AppEnv {
  const cookieSecret = readCookieSecret(source)
  return {
    apiBaseUrl: required(source, 'API_BASE_URL'),
    apiKey: required(source, 'API_KEY'),
    cookieSecret,
  }
}

let resolved: AppEnv | null = null

/**
 * The one place in this app that reads `process.env`, memoised after the first call.
 *
 * `n/no-process-env` is an error everywhere else and lifted for this file alone in
 * `apps/microtask/eslint.config.js`, so "which file reads the environment" is answered by the
 * lint config rather than by a comment (ADR 0012).
 *
 * It is a **function** rather than a validated module-level constant, because `next build`
 * imports every route's whole module graph to collect its configuration, so a module-level
 * `readEnv(process.env)` makes the *build* fail without production secrets. Measured —
 * `Failed to collect configuration for /login`, and `export const dynamic = 'force-dynamic'` does
 * not avoid it. The boot check the plan asked for is `register` in `instrumentation.ts`, which
 * calls this once at server start and never during the build; no caller can obtain an
 * {@link AppEnv} that skipped {@link readEnv} either way.
 */
export function appEnv(): AppEnv {
  resolved ??= readEnv(process.env)
  return resolved
}
