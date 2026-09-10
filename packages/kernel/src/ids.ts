import { randomBytes } from 'node:crypto'

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/

function encodeTime(value: number, length: number): string {
  let remaining = value
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out = `${B32[remaining % 32] ?? '0'}${out}`
    remaining = Math.floor(remaining / 32)
  }
  return out
}

function encodeRandom(length: number): string {
  const bytes = randomBytes(length)
  let out = ''
  for (const byte of bytes) out += B32[byte % 32] ?? '0'
  return out
}

/** Creates a lexicographically sortable 26-character identifier. */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now, 10) + encodeRandom(16)
}

/** Narrows a value to a ULID-shaped identifier. */
export const isUlid = (value: unknown): value is string =>
  typeof value === 'string' && ULID.test(value)

/** Creates an opaque, unguessable share-link token. */
export const shareToken = (): string => randomBytes(24).toString('base64url')

/** Narrows a value to a share-link-token-shaped string. */
export const isShareToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN.test(value)
