import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

/**
 * Length of the random nonce prefixing every sealed blob, in bytes.
 *
 * Twelve is GCM's native IV length: anything else is run through GHASH first, which costs a block
 * and buys nothing. Exported so a tamper test can address the IV region by offset rather than by
 * guessing the layout.
 */
export const IV_BYTES = 12

/** Length of the GCM authentication tag, in bytes. Exported for the same reason as {@link IV_BYTES}. */
export const TAG_BYTES = 16

const keyFor = (secret: string): Buffer => createHash('sha256').update(secret, 'utf8').digest()

/**
 * Seals a string into an authenticated AES-256-GCM blob, base64url encoded.
 *
 * What this seals is an epic's binding to a Microtask project (design §7.2): the share-link token
 * an admin names when running `epic:bind`, held inside the owning plan's manifest file on disk. A
 * `manage`-role binding is a live bearer that can create a real task in the bound project the
 * moment an epic names one, so a plaintext manifest would turn every backup of `data/`, every copy
 * an operator pulls for debugging, and every other path that can read a file on this host into a
 * way to mint tasks in somebody else's Microtask project. Encryption rather than a signature, for
 * the reason `@repo/app-session` chose it for the admin cookie: a signature proves a token was not
 * edited and says nothing about a reader who can already see it, and both tokens must stay
 * unreadable to anything that is not the API asking the bound product to act on them.
 *
 * This duplicates `@repo/app-session/crypto` on purpose rather than sharing it (ADR 0052).
 * `@repo/app-session` carries a `next` peer dependency and cannot be reached from `apps/api`, and
 * the fix that would let it — `@repo/app-session` depending on `@repo/kernel` — would put the
 * authorization kernel one import away from a Next app rendering a permission gate locally instead
 * of asking the API, which is the exact mistake ADR 0027's import allowlist exists to prevent. A
 * second implementation of the same cipher is the price of keeping that boundary real.
 *
 * The key is `sha256(secret)` rather than the secret's own bytes, so a secret of any length
 * collapses to exactly the 32 bytes AES-256 takes, with no truncation of a long one and no padding
 * of a short one.
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
 * **Every** failure is `null` and none is an exception: a tampered binding, a binding sealed under
 * a rotated `BRIDGE_SECRET`, a truncated blob and a string that was never one at all all mean the
 * same thing to a caller — this epic cannot be read as bound — and design §7.2 requires that be
 * shown as the stated "unlinked" state rather than an error surfacing on someone's plan.
 *
 * `authTagLength` is load-bearing rather than a formality, the same finding `@repo/app-session`
 * recorded for the cookie cipher: without it, Node's GCM decipher accepts any tag from 4 to 16
 * bytes, so a blob too short to hold a full tag verifies against however many tag bytes it happens
 * to carry — measured there: an 8-byte tag computed under the right key opened. Pinning the length
 * makes the primitive refuse a short tag itself, rather than trusting a length check placed in
 * front of it to have been written correctly.
 */
export function open(secret: string, sealed: string): string | null {
  const raw = Buffer.from(sealed, 'base64url')
  try {
    const decipher = createDecipheriv(ALGORITHM, keyFor(secret), raw.subarray(0, IV_BYTES), {
      authTagLength: TAG_BYTES,
    })
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    const body = raw.subarray(IV_BYTES + TAG_BYTES)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
