import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seal } from '@repo/app-session/crypto'
import type * as Crypto from '@repo/app-session/crypto'
import { ADMIN_COOKIE, payloadOf } from './lib/principal'
import { LINK_UNAVAILABLE_PATH } from './lib/routes'
import { config, proxy } from './proxy'

const opened: string[] = []

vi.mock('@repo/app-session/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>()
  return {
    ...actual,
    open: (secret: string, value: string) => {
      opened.push(value)
      return actual.open(secret, value)
    },
  }
})

const ORIGIN = 'https://macroplan.example'
const SECRET = 'a-cookie-secret-of-at-least-32-by'
const ADMIN = seal(SECRET, payloadOf({ kind: 'admin', token: 'admin.1.sig' }))
const MICROTASK_COOKIE = 'mt_admin'

/**
 * {@link ADMIN} with its second-to-last character replaced, so the seal cannot open.
 *
 * The replacement is chosen by inspecting the character it replaces, not fixed: choosing from the
 * *last* character instead silently produced the unmodified blob whenever the two already
 * matched, and `seal()` draws a fresh IV per call, so the case failed at random. That was
 * measured in apps/microtask at 1.58% per run before it was found.
 */
const FLIPPED = `${ADMIN.slice(0, -2)}${ADMIN.at(-2) === 'A' ? 'B' : 'A'}${ADMIN.slice(-1)}`

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  opened.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

interface Visit {
  readonly method?: string
  readonly cookies?: Readonly<Record<string, string>>
}

const visit = (path: string, options: Visit = {}): Response => {
  const cookie = Object.entries(options.cookies ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
  const headers: Record<string, string> = { 'x-forwarded-proto': 'https' }
  if (cookie !== '') headers['cookie'] = cookie
  return proxy(new NextRequest(`${ORIGIN}${path}`, { method: options.method ?? 'GET', headers }))
}

const locationOf = (response: Response): string | null => response.headers.get('location')

const isRedirect = (response: Response): boolean => response.status >= 300 && response.status < 400

const signedIn = { [ADMIN_COOKIE]: ADMIN }

describe('the admin gate', () => {
  it.each(['/', '/plans', '/plans/01HXYZ'])('lets %s through for a browser holding mp_admin', (path) => {
    expect(isRedirect(visit(path, { cookies: signedIn }))).toBe(false)
  })

  it.each(['/plans', '/plans/01HXYZ'])('sends %s to /login with the deep link when no cookie is held', (path) => {
    const response = visit(path)
    expect(isRedirect(response)).toBe(true)
    expect(locationOf(response)).toBe(`${ORIGIN}/login?next=${encodeURIComponent(path)}`)
  })

  it('carries the query string into the deep link, so a filtered view survives a sign-in', () => {
    expect(locationOf(visit('/plans?view=quarter'))).toBe(
      `${ORIGIN}/login?next=${encodeURIComponent('/plans?view=quarter')}`,
    )
  })

  it('omits the parameter for the root, which needs no round trip', () => {
    expect(locationOf(visit('/'))).toBe(`${ORIGIN}/login`)
  })
})

describe('what counts as holding a session', () => {
  it('refuses a tampered cookie exactly as it refuses an absent one', () => {
    expect(isRedirect(visit('/', { cookies: { [ADMIN_COOKIE]: FLIPPED } }))).toBe(true)
  })

  it('refuses a cookie sealed under a rotated secret', () => {
    const other = seal('another-secret-of-at-least-32-byt', payloadOf({ kind: 'admin', token: 'a' }))
    expect(isRedirect(visit('/', { cookies: { [ADMIN_COOKIE]: other } }))).toBe(true)
  })

  it('refuses an empty cookie value without calling open on it', () => {
    expect(isRedirect(visit('/', { cookies: { [ADMIN_COOKIE]: '' } }))).toBe(true)
  })

  it('does not accept Microtask’s cookie, even sealed under the same secret (ADR 0014)', () => {
    expect(isRedirect(visit('/', { cookies: { [MICROTASK_COOKIE]: ADMIN } }))).toBe(true)
  })
})

describe('/login', () => {
  it('passes with no session, or the gate would send it to itself forever', () => {
    expect(isRedirect(visit('/login'))).toBe(false)
  })

  it('passes with a session too, because opening it changes nothing', () => {
    expect(isRedirect(visit('/login', { cookies: signedIn }))).toBe(false)
  })
})

describe('the link surface, whose URL is its credential', () => {
  it('lets a share link through with no cookie, because the token is the credential', () => {
    expect(locationOf(visit('/s/tok_A_PLAN_SEAT_0001'))).toBeNull()
  })

  it('never routes a token into a login URL, at any depth under /s', () => {
    for (const path of ['/s', '/s/tok_A_PLAN_SEAT_0001', '/s/tok_A_PLAN_SEAT_0001/anything']) {
      expect(locationOf(visit(path)), path).toBeNull()
    }
  })

  it('lets the terminal page through, which is reached by redirect and must not be gated', () => {
    expect(locationOf(visit(LINK_UNAVAILABLE_PATH))).toBeNull()
  })

  it.each([
    ['no cookie', {}],
    ['a live mp_admin', signedIn],
    ['an mp_admin that will not open', { [ADMIN_COOKIE]: FLIPPED }],
  ])('passes with %s, since no cookie decides anything there', (_label, cookies) => {
    const response = visit('/s/tok_A_PLAN_SEAT_0001', { cookies })
    expect(isRedirect(response)).toBe(false)
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it.each(['/s', '/s/tok_A_PLAN_SEAT_0001', '/s/tok_A_PLAN_SEAT_0001/anything', LINK_UNAVAILABLE_PATH])(
    'opens no cookie at %s, with a live mp_admin in the jar, so nothing there can decide on one',
    (path) => {
      expect(isRedirect(visit(path, { cookies: signedIn }))).toBe(false)
      expect(opened).toEqual([])
    },
  )

  it('opens the cookie on the admin surface, which is the read the rule above is ahead of', () => {
    expect(isRedirect(visit('/plans/01M240ERCRWWCN16Q5AHP1FZAQ', { cookies: signedIn }))).toBe(false)
    expect(opened).toEqual([ADMIN])
  })

  it('treats /splash as the admin surface, which a startsWith without the separator would not', () => {
    expect(locationOf(visit('/splash')) ?? '').toContain('/login?next=')
  })

  it('still gates the admin surface, so the new rule is not a hole in the old one', () => {
    expect(locationOf(visit('/plans/01M240ERCRWWCN16Q5AHP1FZAQ')) ?? '').toContain('/login?next=')
  })

  it('still gates a route handler, which must exempt itself deliberately', () => {
    expect(locationOf(visit('/api/anything')) ?? '').toContain('/login?next=')
  })
})

describe('it writes no cookie on any request', () => {
  it.each([
    ['/login', {}],
    ['/', {}],
    ['/', signedIn],
    ['/', { [ADMIN_COOKIE]: FLIPPED }],
  ])('sets nothing on a GET of %s', (path, cookies) => {
    const response = visit(path, { cookies })
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get('clear-site-data')).toBeNull()
  })
})

describe('it gates navigations only', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('lets a %s through, which answers its own remedy', (method) => {
    expect(isRedirect(visit('/plans', { method }))).toBe(false)
  })

  it('gates a HEAD as it gates a GET, since a prefetch may use either', () => {
    expect(isRedirect(visit('/plans', { method: 'HEAD' }))).toBe(true)
  })
})

describe('the matcher', () => {
  it.each(['_next/static/chunk.js', '_next/image', 'favicon.ico', 'img/logo.webp'])(
    'excludes %s, so an unauthenticated browser still gets it',
    (path) => {
      const [pattern] = config.matcher
      expect(new RegExp(`^${String(pattern)}$`).test(`/${path}`)).toBe(false)
    },
  )

  it.each(['/', '/plans', '/login', '/s', '/s/tok_A_PLAN_SEAT_0001', LINK_UNAVAILABLE_PATH])(
    'covers %s',
    (path) => {
      const [pattern] = config.matcher
      expect(new RegExp(`^${String(pattern)}$`).test(path)).toBe(true)
    },
  )
})
