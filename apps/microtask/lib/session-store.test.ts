import { beforeEach, describe, expect, it } from 'vitest'
import { seal } from './crypto'
import { ADMIN_COOKIE, LINK_COOKIE, LINK_MAX_AGE_SECONDS, payloadOf } from './principal'
import { sessionCookies, type SealedCookie } from './session-store'

const SECRET = 'a-cookie-secret-of-at-least-32-by'
const BEARER_TTL = 3600

interface Jar {
  readonly store: Map<string, SealedCookie>
  readonly reads: string[]
  get(name: string): { readonly value: string } | undefined
  set(cookie: SealedCookie): void
}

const makeJar = (): Jar => ({
  store: new Map<string, SealedCookie>(),
  reads: [],
  get(name) {
    this.reads.push(name)
    const found = this.store.get(name)
    return found === undefined ? undefined : { value: found.value }
  },
  set(cookie) {
    this.store.set(cookie.name, cookie)
  },
})

const put = (jar: Jar, name: string, value: string): void => {
  jar.store.set(name, {
    name,
    value,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 1,
  })
}

let jar: Jar

beforeEach(() => {
  jar = makeJar()
})

const cookiesFor = (secure = true) => sessionCookies({ jar, secret: SECRET, secure })

describe('reading', () => {
  it('reads an admin principal out of mt_admin', () => {
    put(jar, ADMIN_COOKIE, seal(SECRET, payloadOf({ kind: 'admin', token: 'bearer' })))
    expect(cookiesFor().admin()).toEqual({ kind: 'admin', token: 'bearer' })
  })

  it('reads a link principal out of mt_link', () => {
    put(jar, LINK_COOKIE, seal(SECRET, payloadOf({ kind: 'link', token: 'share' })))
    expect(cookiesFor().link()).toEqual({ kind: 'link', token: 'share' })
  })

  it('reads mt_link and nothing else when asked for a link principal', () => {
    put(jar, ADMIN_COOKIE, seal(SECRET, payloadOf({ kind: 'admin', token: 'bearer' })))
    expect(cookiesFor().link()).toBeNull()
    expect(jar.reads).toEqual([LINK_COOKIE])
  })

  it('reads mt_admin and nothing else when asked for an admin principal', () => {
    put(jar, LINK_COOKIE, seal(SECRET, payloadOf({ kind: 'link', token: 'share' })))
    expect(cookiesFor().admin()).toBeNull()
    expect(jar.reads).toEqual([ADMIN_COOKIE])
  })

  it('treats an absent cookie as no session', () => {
    expect(cookiesFor().admin()).toBeNull()
    expect(cookiesFor().link()).toBeNull()
  })

  it('treats a tampered cookie as absent rather than as an error', () => {
    const sealed = Buffer.from(seal(SECRET, payloadOf({ kind: 'admin', token: 'b' })), 'base64url')
    const last = sealed.length - 1
    const byte = sealed[last]
    if (byte === undefined) throw new Error('empty blob')
    sealed[last] = byte ^ 0x01
    put(jar, ADMIN_COOKIE, sealed.toString('base64url'))
    expect(cookiesFor().admin()).toBeNull()
  })

  it('treats a cookie sealed under a different secret as absent', () => {
    put(jar, ADMIN_COOKIE, seal('another-secret-of-at-least-32-byt', payloadOf({ kind: 'admin', token: 'b' })))
    expect(cookiesFor().admin()).toBeNull()
  })

  it('refuses an admin payload moved into mt_link, even though one secret seals both', () => {
    put(jar, LINK_COOKIE, seal(SECRET, payloadOf({ kind: 'admin', token: 'bearer' })))
    expect(cookiesFor().link()).toBeNull()
  })
})

describe('sealing', () => {
  it("gives mt_admin the bearer's own lifetime, not thirty days", () => {
    cookiesFor().sealAdmin('bearer', BEARER_TTL)
    expect(jar.store.get(ADMIN_COOKIE)?.maxAge).toBe(BEARER_TTL)
    expect(jar.store.get(ADMIN_COOKIE)?.maxAge).not.toBe(LINK_MAX_AGE_SECONDS)
  })

  it('gives mt_link thirty days', () => {
    cookiesFor().sealLink('share')
    expect(jar.store.get(LINK_COOKIE)?.maxAge).toBe(LINK_MAX_AGE_SECONDS)
  })

  it('seals a value that opens back to the principal it was given', () => {
    const session = cookiesFor()
    session.sealAdmin('bearer', BEARER_TTL)
    put(jar, ADMIN_COOKIE, jar.store.get(ADMIN_COOKIE)?.value ?? '')
    expect(session.admin()).toEqual({ kind: 'admin', token: 'bearer' })
  })

  it('never writes the token in the clear', () => {
    cookiesFor().sealLink('share-token-in-the-clear')
    expect(jar.store.get(LINK_COOKIE)?.value).not.toContain('share-token-in-the-clear')
    expect(jar.store.get(LINK_COOKIE)?.value).not.toContain('link')
  })

  it('marks both cookies httpOnly, Path=/ and SameSite=Lax', () => {
    const session = cookiesFor()
    session.sealAdmin('bearer', BEARER_TTL)
    session.sealLink('share')
    for (const name of [ADMIN_COOKIE, LINK_COOKIE]) {
      expect(jar.store.get(name)).toMatchObject({ httpOnly: true, path: '/', sameSite: 'lax' })
    }
  })

  it.each([true, false])('takes Secure from the proxy protocol (%s)', (secure) => {
    cookiesFor(secure).sealAdmin('bearer', BEARER_TTL)
    expect(jar.store.get(ADMIN_COOKIE)?.secure).toBe(secure)
  })

  it('leaves mt_link untouched when it seals mt_admin', () => {
    cookiesFor().sealLink('share')
    const before = jar.store.get(LINK_COOKIE)
    cookiesFor().sealAdmin('bearer', BEARER_TTL)
    expect(jar.store.get(LINK_COOKIE)).toBe(before)
    expect(cookiesFor().link()).toEqual({ kind: 'link', token: 'share' })
  })

  it('leaves mt_admin untouched when it seals mt_link', () => {
    cookiesFor().sealAdmin('bearer', BEARER_TTL)
    const before = jar.store.get(ADMIN_COOKIE)
    cookiesFor().sealLink('share')
    expect(jar.store.get(ADMIN_COOKIE)).toBe(before)
  })
})

describe('clearing', () => {
  it('clears mt_admin with a zero Max-Age and the same attributes', () => {
    const session = cookiesFor()
    session.sealAdmin('bearer', BEARER_TTL)
    session.clearAdmin()
    expect(jar.store.get(ADMIN_COOKIE)).toMatchObject({ value: '', maxAge: 0, path: '/' })
  })

  it('clears mt_link and leaves mt_admin alone', () => {
    const session = cookiesFor()
    session.sealAdmin('bearer', BEARER_TTL)
    session.sealLink('share')
    const admin = jar.store.get(ADMIN_COOKIE)
    session.clearLink()
    expect(jar.store.get(LINK_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
    expect(jar.store.get(ADMIN_COOKIE)).toBe(admin)
  })

  it('clears mt_admin and leaves mt_link alone', () => {
    const session = cookiesFor()
    session.sealAdmin('bearer', BEARER_TTL)
    session.sealLink('share')
    const link = jar.store.get(LINK_COOKIE)
    session.clearAdmin()
    expect(jar.store.get(LINK_COOKIE)).toBe(link)
  })
})
