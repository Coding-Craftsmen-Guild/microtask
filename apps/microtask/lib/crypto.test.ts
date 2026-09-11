import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { IV_BYTES, TAG_BYTES, open, seal } from './crypto'

const secret = 'cookie-secret-that-is-long-enough-32'
const other = 'a-different-secret-also-long-enough!'
const payload = JSON.stringify({ kind: 'link', token: 'sharetokenabcdef0123456789' })

const flip = (sealed: string, offset: number): string => {
  const raw = Buffer.from(sealed, 'base64url')
  const byte = raw[offset]
  if (byte === undefined) throw new Error(`no byte at ${String(offset)}`)
  raw[offset] = byte ^ 0x01
  return raw.toString('base64url')
}

describe('seal and open', () => {
  it('round-trips a payload', () => {
    expect(open(secret, seal(secret, payload))).toBe(payload)
  })

  it('produces a different blob every time, so a fresh IV is used per seal', () => {
    expect(seal(secret, payload)).not.toBe(seal(secret, payload))
  })

  it('round-trips a payload far longer than one AES block', () => {
    const long = 'x'.repeat(4096)
    expect(open(secret, seal(secret, long))).toBe(long)
  })

  it('round-trips a payload with characters outside ASCII', () => {
    const unicode = '{"name":"café — 日本語 🎉"}'
    expect(open(secret, seal(secret, unicode))).toBe(unicode)
  })

  it('refuses a blob whose ciphertext has one bit flipped', () => {
    const sealed = seal(secret, payload)
    expect(open(secret, flip(sealed, IV_BYTES + TAG_BYTES))).toBeNull()
  })

  it('refuses a blob whose auth tag has one bit flipped', () => {
    const sealed = seal(secret, payload)
    expect(open(secret, flip(sealed, IV_BYTES))).toBeNull()
  })

  it('refuses a blob whose IV has one bit flipped', () => {
    const sealed = seal(secret, payload)
    expect(open(secret, flip(sealed, 0))).toBeNull()
  })

  it('refuses every single-bit flip anywhere in the blob', () => {
    const sealed = seal(secret, payload)
    const length = Buffer.from(sealed, 'base64url').length
    const survivors = []
    for (let at = 0; at < length; at += 1) {
      if (open(secret, flip(sealed, at)) !== null) survivors.push(at)
    }
    expect(survivors).toEqual([])
  })

  it('refuses a tag shorter than 128 bits, even one computed under the right key', () => {
    const key = createHash('sha256').update(secret, 'utf8').digest()
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([cipher.update('', 'utf8'), cipher.final()])
    const truncated = cipher.getAuthTag().subarray(0, 8)
    expect(open(secret, Buffer.concat([iv, truncated, body]).toString('base64url'))).toBeNull()
  })

  it('refuses a blob sealed under a different secret', () => {
    expect(open(other, seal(secret, payload))).toBeNull()
  })

  it.each([
    ['an empty string', ''],
    ['a value that is not base64url', 'not*valid*base64url'],
    ['a blob too short to hold an IV and a tag', Buffer.alloc(IV_BYTES).toString('base64url')],
    ['a blob of exactly IV and tag length with no ciphertext', Buffer.alloc(IV_BYTES + TAG_BYTES).toString('base64url')],
  ])('refuses %s', (_label, value) => {
    expect(open(secret, value)).toBeNull()
  })

  it('refuses a truncated blob rather than throwing', () => {
    const sealed = seal(secret, payload)
    const raw = Buffer.from(sealed, 'base64url')
    expect(open(secret, raw.subarray(0, raw.length - 4).toString('base64url'))).toBeNull()
  })

  it('lays the blob out as IV, then tag, then ciphertext', () => {
    const raw = Buffer.from(seal(secret, payload), 'base64url')
    expect(raw.length).toBe(IV_BYTES + TAG_BYTES + Buffer.byteLength(payload))
  })
})
