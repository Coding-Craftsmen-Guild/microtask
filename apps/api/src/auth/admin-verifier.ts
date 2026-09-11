import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Clock } from '@repo/kernel'
import { Invalid } from '@repo/kernel'
import type { ApiConfig } from '../config.js'

/** Verification of an admin bearer token, narrowed to what principal resolution needs. */
export interface AdminTokens {
  /** Reports whether this is an unexpired admin token this API minted. */
  verify(token: string): boolean
}

/** A minted admin token and when it stops working. */
export interface AdminToken {
  /** The bearer value a client sends back as `Authorization: Bearer …`. */
  readonly token: string

  /** The instant it stops verifying, as ISO 8601. */
  readonly expiresAt: string

  /** How long it has from now, which is what a login response reports. */
  readonly expiresInSeconds: number
}

/** What the verifier needs, naming the config keys once. */
export interface AdminVerifierOptions {
  /** The signing key and lifetime, plus the password login checks against. */
  readonly config: Pick<ApiConfig, 'adminPassword' | 'sessionSecret' | 'adminTokenTtlSeconds'>

  /** The clock expiry is measured against, injected so a test can move it. */
  readonly clock: Clock
}

const SUBJECT = 'admin'
const DECIMAL = /^[0-9]+$/
const SEGMENTS = 3

const digest = (value: string): Buffer => createHash('sha256').update(value).digest()

const sameLengthEqual = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * Mints and checks the short-lived admin token `POST /v1/auth/login` hands out (ADR 0012).
 *
 * The app being replaced kept an admin session as a cookie holding `sha256('ccg:' + password)`,
 * compared in constant time against the same digest of the configured password. That value was
 * password-equivalent: it never expired server-side, never rotated, and the only way to revoke a
 * leaked one was to change the password. Two things carry forward and one does not. The password
 * comparison still hashes both sides first, because that is what lets `timingSafeEqual` run on
 * two buffers of equal length whatever the candidate; the `ccg:` domain separator does not,
 * since nothing stores the digest any more and an unobservable constant is not a rule. What the
 * token *is* does not carry forward at all: it is now a signed expiry, so a session has a bounded
 * life and rotating `SESSION_SECRET` ends every one of them without touching the password.
 */
export class AdminVerifier implements AdminTokens {
  readonly #config: AdminVerifierOptions['config']
  readonly #clock: Clock

  /** Creates the verifier over an injected config and clock. */
  constructor(options: AdminVerifierOptions) {
    this.#config = options.config
    this.#clock = options.clock
  }

  /** Reports whether a login attempt presented the configured password. */
  checkPassword(candidate: string): boolean {
    return timingSafeEqual(digest(candidate), digest(this.#config.adminPassword))
  }

  /** Mints a token valid for `ADMIN_TOKEN_TTL_SECONDS` from now. */
  issue(): AdminToken {
    const seconds = this.#config.adminTokenTtlSeconds
    const expiresAt = this.#seconds() + seconds
    if (!Number.isFinite(expiresAt)) throw new Invalid('The clock did not report a usable instant')
    const payload = `${SUBJECT}.${String(expiresAt)}`
    return {
      token: `${payload}.${this.#sign(payload)}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      expiresInSeconds: seconds,
    }
  }

  /** Reports whether a bearer value is an unexpired token this verifier minted. */
  verify(token: string): boolean {
    const parts = token.split('.')
    if (parts.length !== SEGMENTS) return false
    const [subject, expiresAt, signature] = parts
    if (expiresAt === undefined || signature === undefined) return false
    if (subject !== SUBJECT || !DECIMAL.test(expiresAt)) return false
    if (!sameLengthEqual(signature, this.#sign(`${subject}.${expiresAt}`))) return false
    return Number(expiresAt) > this.#seconds()
  }

  #sign(payload: string): string {
    return createHmac('sha256', this.#config.sessionSecret).update(payload).digest('base64url')
  }

  #seconds(): number {
    return Math.floor(Date.parse(this.#clock.now()) / 1000)
  }
}
