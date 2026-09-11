import { beforeEach, describe, expect, it } from 'vitest'
import { seal } from './crypto'
import { ADMIN_COOKIE, payloadOf } from './principal'
import { clearedCookie, secureFrom, sessionCookies, type SealedCookie } from './session-store'

const SECRET = 'a-cookie-secret-of-at-least-32-by'
const BEARER_TTL = 3600
const STRAY = 'mt_link'

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

describe('the session has one cookie and no link half (ADR 0040)', () => {
  it('offers exactly the three admin operations', () => {
    expect(Object.keys(cookiesFor()).sort()).toEqual(['admin', 'clearAdmin', 'sealAdmin'])
  })

  it('reads mt_admin and nothing else, even beside a stray mt_link an older build sealed', () => {
    put(jar, STRAY, seal(SECRET, payloadOf({ kind: 'link', token: 'share' })))
    expect(cookiesFor().admin()).toBeNull()
    expect(jar.reads).toEqual([ADMIN_COOKIE])
  })
})

describe('reading', () => {
  it('reads an admin principal out of mt_admin', () => {
    put(jar, ADMIN_COOKIE, seal(SECRET, payloadOf({ kind: 'admin', token: 'bearer' })))
    expect(cookiesFor().admin()).toEqual({ kind: 'admin', token: 'bearer' })
  })

  it('treats an absent cookie as no session', () => {
    expect(cookiesFor().admin()).toBeNull()
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

  it('refuses a link payload sealed into mt_admin, even though one secret sealed both', () => {
    put(jar, ADMIN_COOKIE, seal(SECRET, payloadOf({ kind: 'link', token: 'share' })))
    expect(cookiesFor().admin()).toBeNull()
  })
})

describe('sealing', () => {
  it("gives mt_admin the bearer's own lifetime", () => {
    cookiesFor().sealAdmin('bearer', BEARER_TTL)
    expect(jar.store.get(ADMIN_COOKIE)?.maxAge).toBe(BEARER_TTL)
  })

  it('follows a bearer lifetime longer than an hour rather than capping it', () => {
    cookiesFor().sealAdmin('bearer', 86_400)
    expect(jar.store.get(ADMIN_COOKIE)?.maxAge).toBe(86_400)
  })

  it('seals a value that opens back to the principal it was given', () => {
    const session = cookiesFor()
    session.sealAdmin('bearer', BEARER_TTL)
    put(jar, ADMIN_COOKIE, jar.store.get(ADMIN_COOKIE)?.value ?? '')
    expect(session.admin()).toEqual({ kind: 'admin', token: 'bearer' })
  })

  it('never writes the bearer in the clear', () => {
    cookiesFor().sealAdmin('bearer-in-the-clear', BEARER_TTL)
    expect(jar.store.get(ADMIN_COOKIE)?.value).not.toContain('bearer-in-the-clear')
    expect(jar.store.get(ADMIN_COOKIE)?.value).not.toContain('admin')
  })

  it('marks the cookie httpOnly, Path=/ and SameSite=Lax', () => {
    cookiesFor().sealAdmin('bearer', BEARER_TTL)
    expect(jar.store.get(ADMIN_COOKIE)).toMatchObject({ httpOnly: true, path: '/', sameSite: 'lax' })
  })

  it.each([true, false])('takes Secure from the proxy protocol (%s)', (secure) => {
    cookiesFor(secure).sealAdmin('bearer', BEARER_TTL)
    expect(jar.store.get(ADMIN_COOKIE)?.secure).toBe(secure)
  })

  it('writes mt_admin and no other cookie', () => {
    cookiesFor().sealAdmin('bearer', BEARER_TTL)
    expect([...jar.store.keys()]).toEqual([ADMIN_COOKIE])
  })
})

describe('clearing', () => {
  it('clears mt_admin with a zero Max-Age and the same attributes', () => {
    const session = cookiesFor()
    session.sealAdmin('bearer', BEARER_TTL)
    session.clearAdmin()
    expect(jar.store.get(ADMIN_COOKIE)).toMatchObject({ value: '', maxAge: 0, path: '/' })
  })

  it('leaves any other cookie alone', () => {
    put(jar, STRAY, 'kept')
    cookiesFor().clearAdmin()
    expect(jar.store.get(STRAY)?.value).toBe('kept')
  })

  it.each([true, false])('clears with the Secure the request arrived with (%s)', (secure) => {
    cookiesFor(secure).clearAdmin()
    expect(jar.store.get(ADMIN_COOKIE)?.secure).toBe(secure)
  })
})

describe('secureFrom', () => {
  it.each([
    ['https', true],
    ['HTTPS', true],
    ['https, http', true],
    [' https ', true],
    ['http', false],
    ['http, https', false],
    ['', false],
    [null, false],
  ])('reads x-forwarded-proto %j as secure=%s', (header, expected) => {
    expect(secureFrom(header)).toBe(expected)
  })
})

describe('clearedCookie', () => {
  it('carries the same attributes a sealed cookie does, so the browser replaces it', () => {
    cookiesFor(true).sealAdmin('bearer', BEARER_TTL)
    const sealed = jar.store.get(ADMIN_COOKIE)
    expect(clearedCookie(ADMIN_COOKIE, true)).toEqual({ ...sealed, value: '', maxAge: 0 })
  })
})
