import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { seal } from './lib/crypto'
import { ADMIN_COOKIE, LINK_COOKIE, payloadOf } from './lib/principal'
import { LINK_UNAVAILABLE_PATH } from './lib/routes'
import { config, proxy } from './proxy'

const ORIGIN = 'https://microtask.example'
const SECRET = 'a-cookie-secret-of-at-least-32-by'
const ADMIN = seal(SECRET, payloadOf({ kind: 'admin', token: 'admin.1.sig' }))

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

interface Visit {
  readonly method?: string
  readonly cookies?: Readonly<Record<string, string>>
  readonly headers?: Readonly<Record<string, string>>
}

const visit = (path: string, options: Visit = {}): Response => {
  const cookie = Object.entries(options.cookies ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
  const headers: Record<string, string> = { 'x-forwarded-proto': 'https', ...options.headers }
  if (cookie !== '') headers['cookie'] = cookie
  return proxy(new NextRequest(`${ORIGIN}${path}`, { method: options.method ?? 'GET', headers }))
}

const locationOf = (response: Response): string | null => response.headers.get('location')

const cookieWrites = (response: Response): string[] => {
  const cleared = response.headers.get('clear-site-data')
  const written = response.headers.getSetCookie()
  return cleared === null ? written : [...written, `Clear-Site-Data: ${cleared}`]
}

const isRedirect = (response: Response): boolean => response.status >= 300 && response.status < 400

const BOTH = { [ADMIN_COOKIE]: ADMIN, [LINK_COOKIE]: 'a-sealed-link' }

const SAME_ORIGIN_FETCH = { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }

const ARRIVALS = [
  ['a plain navigation', {}],
  ['an address typed into the bar', { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }],
  [
    'a Next prefetch of a rendered <Link>',
    { ...SAME_ORIGIN_FETCH, rsc: '1', 'next-router-prefetch': '1', 'next-router-segment-prefetch': '/_tree' },
  ],
  ['a browser prefetch', { purpose: 'prefetch', 'sec-purpose': 'prefetch', 'sec-fetch-site': 'same-origin' }],
  ['a router navigation, which a Server Action redirect also makes', { ...SAME_ORIGIN_FETCH, rsc: '1' }],
  ['a top-level link from another site', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }],
] as const

describe('the admin surface with no mt_admin', () => {
  it.each(['/', '/p/01HXYZ', '/p/01HXYZ/t/01HABC'])('sends %s to /login', (path) => {
    const response = visit(path)
    expect(isRedirect(response)).toBe(true)
    expect(new URL(locationOf(response) ?? '').pathname).toBe('/login')
  })

  it('carries the deep link, query string included', () => {
    const response = visit('/p/01HXYZ/t/01HABC?tab=01HDEF')
    const next = new URL(locationOf(response) ?? '').searchParams.get('next')
    expect(next).toBe('/p/01HXYZ/t/01HABC?tab=01HDEF')
  })

  it('omits next= for the root rather than round-tripping a redundant /', () => {
    expect(new URL(locationOf(visit('/')) ?? '').search).toBe('')
  })

  it('redirects with a 307, which a browser does not cache the way it caches a 308', () => {
    expect(visit('/p/01HXYZ').status).toBe(307)
  })

  it.each(['/login-help', '/loginx', '/login/anything'])('gates %s rather than treating it as /login', (path) => {
    expect(new URL(locationOf(visit(path)) ?? '').pathname).toBe('/login')
  })

  it('gates /apiary, since only /api and /api/* are API routes', () => {
    expect(isRedirect(visit('/apiary'))).toBe(true)
  })

  it('stays on this origin', () => {
    expect(new URL(locationOf(visit('/p/01HXYZ')) ?? '').origin).toBe(ORIGIN)
  })

  it('treats an empty mt_admin as absent', () => {
    expect(isRedirect(visit('/p/01HXYZ', { cookies: { [ADMIN_COOKIE]: '' } }))).toBe(true)
  })

  it('does not accept mt_link in place of mt_admin', () => {
    expect(isRedirect(visit('/p/01HXYZ', { cookies: { [LINK_COOKIE]: 'sealed' } }))).toBe(true)
  })

  it('lets a non-navigation through, so a Server Action answers with its own remedy', () => {
    expect(isRedirect(visit('/p/01HXYZ', { method: 'POST' }))).toBe(false)
  })

  it('gates a HEAD like a GET, since both are navigations', () => {
    expect(isRedirect(visit('/p/01HXYZ', { method: 'HEAD' }))).toBe(true)
  })

  it('lets the bare /api path through as well as everything under it', () => {
    expect(isRedirect(visit('/api'))).toBe(false)
  })

  it('lets an API route through, so it answers its own 401 instead of an HTML login page', () => {
    expect(isRedirect(visit('/api/projects/01H/tasks/01H/tabs/01H/document'))).toBe(false)
  })
})

describe('the admin surface with mt_admin', () => {
  it('lets the request through without touching either cookie', () => {
    const response = visit('/p/01HXYZ', { cookies: { [ADMIN_COOKIE]: ADMIN, [LINK_COOKIE]: 'x' } })
    expect(isRedirect(response)).toBe(false)
    expect(cookieWrites(response)).toEqual([])
  })

  it.each([
    ['a value that is not a sealed blob', 'garbage'],
    ['a blob with one bit flipped', ADMIN.slice(0, -2) + (ADMIN.endsWith('A') ? 'B' : 'A') + ADMIN.slice(-1)],
    ['a blob sealed under another secret', seal('another-secret-of-at-least-32-byt', payloadOf({ kind: 'admin', token: 't' }))],
    ['a link principal moved into mt_admin', seal(SECRET, payloadOf({ kind: 'link', token: 'share' }))],
  ])('treats %s exactly as it treats no cookie', (_label, value) => {
    const tampered = visit('/p/01HXYZ?tab=01H', { cookies: { [ADMIN_COOKIE]: value } })
    const absent = visit('/p/01HXYZ?tab=01H')
    expect(tampered.status).toBe(absent.status)
    expect(locationOf(tampered)).toBe(locationOf(absent))
    expect(cookieWrites(tampered)).toEqual(cookieWrites(absent))
  })
})

describe('/login', () => {
  it.each(ARRIVALS)('touches neither cookie on %s, so a signed-in admin stays signed in', (_label, headers) => {
    const response = visit('/login', { cookies: BOTH, headers })
    expect(isRedirect(response)).toBe(false)
    expect(cookieWrites(response)).toEqual([])
  })

  it('touches neither cookie on a HEAD, or on the sign-in POST that seals mt_admin itself', () => {
    for (const method of ['HEAD', 'POST']) {
      expect(cookieWrites(visit('/login', { method, cookies: BOTH }))).toEqual([])
    }
  })

  it.each([
    ['no cookie', {}],
    ['an mt_admin that will not open', { [ADMIN_COOKIE]: 'garbage' }],
    ['an mt_admin that opens', { [ADMIN_COOKIE]: ADMIN }],
  ])('is not itself gated when it holds %s, however it arrives', (_label, cookies) => {
    for (const [, headers] of ARRIVALS) {
      expect(isRedirect(visit('/login', { cookies, headers }))).toBe(false)
      expect(isRedirect(visit('/login?next=%2Fp%2F01HXYZ', { cookies, headers }))).toBe(false)
    }
  })

  it.each(ARRIVALS)('ends the redirect chain from a gated page after one hop on %s, at /login, rather than looping', (_label, headers) => {
    const hops: string[] = []
    let path = '/p/01HXYZ/t/01HABC?tab=01HDEF'
    for (let hop = 0; hop < 5; hop += 1) {
      const response = visit(path, { cookies: { [ADMIN_COOKIE]: 'garbage' }, headers })
      if (!isRedirect(response)) break
      const next = new URL(locationOf(response) ?? '', ORIGIN)
      path = `${next.pathname}${next.search}`
      hops.push(path)
    }
    expect(hops).toEqual(['/login?next=%2Fp%2F01HXYZ%2Ft%2F01HABC%3Ftab%3D01HDEF'])
  })
})

describe('the client surface', () => {
  it.each([
    '/s/sometoken',
    '/s/sometoken/t/01HABC',
    '/s/sometoken?tab=01HDEF',
    '/share/sometoken',
    LINK_UNAVAILABLE_PATH,
  ])('never sends %s to /login, whatever cookies it holds', (path) => {
    for (const cookies of [{}, { [LINK_COOKIE]: 'sealed' }, { [ADMIN_COOKIE]: 'sealed' }]) {
      const response = visit(path, { cookies })
      expect(locationOf(response) ?? '').not.toContain('/login')
      expect(isRedirect(response)).toBe(false)
    }
  })

  it.each(ARRIVALS)('touches neither cookie at the terminal page on %s', (_label, headers) => {
    expect(cookieWrites(visit(LINK_UNAVAILABLE_PATH, { cookies: BOTH, headers }))).toEqual([])
  })

  it.each(['/s', '/share'])('never sends the bare %s to /login', (path) => {
    expect(isRedirect(visit(path))).toBe(false)
  })

  it.each(['/sales', '/shared-notes', '/s-and-p'])('treats %s as an admin route, by whole segment', (path) => {
    expect(isRedirect(visit(path))).toBe(true)
  })
})

describe('a request of any kind', () => {
  const PATHS = ['/', '/login', '/p/01HXYZ', LINK_UNAVAILABLE_PATH, '/s/sometoken', '/share/sometoken', '/api/x']
  const HELD = [{}, BOTH, { [ADMIN_COOKIE]: 'garbage', [LINK_COOKIE]: 'garbage' }]

  it.each(PATHS)('writes no cookie at %s, whatever it holds and however it arrives', (path) => {
    for (const cookies of HELD) {
      for (const [, headers] of ARRIVALS) {
        for (const method of ['GET', 'HEAD', 'POST']) {
          expect(cookieWrites(visit(path, { method, cookies, headers }))).toEqual([])
        }
      }
    }
  })
})

const matched = (path: string): boolean => config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path))

describe('config', () => {
  it('keeps build assets and the app’s public images out of the matcher', () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico|img/).*)'])
  })

  it('never runs for the logo, which the sign-in page shows to a browser with no session', () => {
    expect(matched('/img/logo.webp')).toBe(false)
  })

  it('still runs for every page, the sign-in page and the client surface included', () => {
    for (const path of ['/', '/login', '/p/01HXYZ', '/p/01HXYZ/t/01HABC', '/s/tokena', '/images', '/imgx/a']) {
      expect(matched(path)).toBe(true)
    }
  })
})
