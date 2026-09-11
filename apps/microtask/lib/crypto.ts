import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

/**
 * Length of the random nonce prefixing every blob, in bytes.
 *
 * Twelve is GCM's native IV length: anything else is run through GHASH first, which costs a
 * block and buys nothing. Exported so a tamper test can address the IV region by offset rather
 * than by guessing the layout.
 */
export const IV_BYTES = 12

/** Length of the GCM authentication tag, in bytes. Exported for the same reason as {@link IV_BYTES}. */
export const TAG_BYTES = 16

const keyFor = (secret: string): Buffer => createHash('sha256').update(secret, 'utf8').digest()

/**
 * Seals a string into an authenticated AES-256-GCM blob, base64url encoded.
 *
 * Encryption and not a signature, because the payload of `mt_link` **is** a live share token and
 * the cookie is sent on every request under `Path=/`. A signed-but-readable cookie publishes that
 * token to anything that can read a request — a proxy log, an error reporter, a browser
 * extension. Signing would prove integrity and this needs confidentiality as well (ADR 0032).
 *
 * The key is `sha256(secret)` rather than the secret's own bytes, so any secret at or above the 32-byte floor
 * `lib/env.ts` enforces produces exactly the 32 bytes AES-256 takes, with no
 * truncation of a long one and no padding of a short one.
 *
 * A fresh random IV per call, prefixed to the blob. Reusing one under GCM is catastrophic — two
 * messages under the same key and IV leak their XOR and forge the authenticator — so it is
 * generated here and never derived from the payload.
 */
export function seal(secret: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, keyFor(secret), iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

/**
 * Opens a blob {@link seal} produced, or returns `null` for anything else.
 *
 * **Every** failure is `null` and none is an exception: a tampered cookie, a cookie sealed under
 * a rotated secret, a truncated cookie and a cookie that was never one at all all mean the same
 * thing to a caller — this browser presents no session — and ADR 0032 requires that be treated
 * as absent rather than as an error a visitor is shown. A thrown
 * `Unsupported state or unable to authenticate data` would otherwise surface as a 500 on a
 * perfectly ordinary secret rotation.
 *
 * Nothing here is timing-sensitive in a way worth defending: the tag comparison inside GCM is
 * already constant-time, and the length checks above it are on a value the caller supplied.
 */
export function open(secret: string, sealed: string): string | null {
  const raw = Buffer.from(sealed, 'base64url')
  if (raw.length <= IV_BYTES + TAG_BYTES) return null
  try {
    const decipher = createDecipheriv(ALGORITHM, keyFor(secret), raw.subarray(0, IV_BYTES))
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    const body = raw.subarray(IV_BYTES + TAG_BYTES)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
