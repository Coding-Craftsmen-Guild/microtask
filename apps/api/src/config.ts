import { Invalid } from '@repo/kernel'

/** The environment a config is read from: `process.env`, or a literal object in a test. */
export type Env = Readonly<Record<string, string | undefined>>

/** Everything the API needs from its environment, already validated. */
export interface ApiConfig {
  /** TCP port to listen on. */
  readonly port: number

  /** Root directory holding every product's projects. */
  readonly dataDir: string

  /**
   * The password `POST /v1/auth/login` checks (ADR 0012). There is no default and no minimum
   * length: the app being replaced refuses to start without one and only *warns* below eight
   * characters, so `server.ts` should warn too rather than lock out an existing deployment.
   */
  readonly adminPassword: string

  /** Signing key for the admin tokens the API mints (ADR 0012). */
  readonly sessionSecret: string

  /** Seals an epic's Microtask binding token at rest, with `@repo/kernel`'s sealing primitive (design §7.2, ADR 0052). */
  readonly bridgeSecret: string

  /** How long a minted admin token stays valid. */
  readonly adminTokenTtlSeconds: number

  /**
   * Service key to service identity, so `x-api-key` names *which app is calling* rather than
   * conferring authority (ADR 0012). A `Map` because its keys are attacker-chosen strings.
   */
  readonly serviceKeys: ReadonlyMap<string, string>
}

interface IntegerBounds {
  readonly fallback: number
  readonly min: number
  readonly max: number
}

const DECIMAL = /^[0-9]+$/
const MIN_SESSION_SECRET = 32
const PORT_BOUNDS: IntegerBounds = { fallback: 4321, min: 1, max: 65535 }
const TTL_BOUNDS: IntegerBounds = { fallback: 3600, min: 1, max: 86400 }

function required(env: Env, key: string): string {
  const raw = env[key]
  if (raw === undefined || raw.trim() === '') {
    throw new Invalid(`${key} is required — refusing to start without it`)
  }
  return raw
}

function readInteger(env: Env, key: string, bounds: IntegerBounds): number {
  const raw = env[key]?.trim()
  if (raw === undefined || raw === '') return bounds.fallback
  if (!DECIMAL.test(raw)) throw new Invalid(`${key} must be a whole number, got "${raw}"`)
  const value = Number(raw)
  if (value < bounds.min || value > bounds.max) {
    throw new Invalid(`${key} must be between ${bounds.min} and ${bounds.max}, got ${value}`)
  }
  return value
}

function readSessionSecret(env: Env): string {
  const secret = required(env, 'SESSION_SECRET')
  if (secret.length < MIN_SESSION_SECRET) {
    throw new Invalid(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET} characters`)
  }
  return secret
}

function splitEntry(entry: string, position: number): readonly [string, string] {
  const at = entry.indexOf('=')
  if (at < 0) throw new Invalid(`SERVICE_KEYS entry ${position} must read "service=key"`)
  const service = entry.slice(0, at).trim()
  const key = entry.slice(at + 1)
  if (service === '') throw new Invalid(`SERVICE_KEYS entry ${position} has no service name`)
  if (key === '') throw new Invalid(`SERVICE_KEYS has no key for "${service}"`)
  if (key !== key.trim()) {
    throw new Invalid(`SERVICE_KEYS key for "${service}" has surrounding whitespace`)
  }
  return [service, key]
}

function readServiceKeys(env: Env): ReadonlyMap<string, string> {
  const byKey = new Map<string, string>()
  const named = new Set<string>()
  const entries = required(env, 'SERVICE_KEYS').split(',')
  for (const [index, entry] of entries.entries()) {
    const [service, key] = splitEntry(entry, index + 1)
    if (named.has(service)) throw new Invalid(`SERVICE_KEYS names "${service}" twice`)
    if (byKey.has(key)) throw new Invalid(`SERVICE_KEYS gives "${service}" a key already in use`)
    named.add(service)
    byKey.set(key, service)
  }
  return byKey
}

/**
 * Validates an environment into an {@link ApiConfig}, throwing `Invalid` naming the offending key.
 *
 * A pure function of its argument: it reads no `process.env`, no clock and no disk, which is what
 * makes every rule here testable and keeps `n/no-process-env` satisfied outside `server.ts`
 * (ADR 0027). Only `PORT` and `ADMIN_TOKEN_TTL_SECONDS` have defaults — a default data root, a
 * default signing key or an empty service-key map would each fail open.
 */
export function readConfig(env: Env): ApiConfig {
  return {
    port: readInteger(env, 'PORT', PORT_BOUNDS),
    dataDir: required(env, 'DATA_DIR'),
    adminPassword: required(env, 'ADMIN_PASSWORD'),
    sessionSecret: readSessionSecret(env),
    bridgeSecret: required(env, 'BRIDGE_SECRET'),
    adminTokenTtlSeconds: readInteger(env, 'ADMIN_TOKEN_TTL_SECONDS', TTL_BOUNDS),
    serviceKeys: readServiceKeys(env),
  }
}
