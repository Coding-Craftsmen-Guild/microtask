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
  readonly proto?: string
}

const visit = (path: string, options: Visit = {}): Response => {
  const cookie = Object.entries(options.cookies ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
  const headers: Record<string, string> = { 'x-forwarded-proto': options.proto ?? 'https' }
  if (cookie !== '') headers['cookie'] = cookie
  return proxy(new NextRequest(`${ORIGIN}${path}`, { method: options.method ?? 'GET', headers }))
}

const locationOf = (response: Response): string | null => response.headers.get('location')

const setCookies = (response: Response): string[] => response.headers.getSetCookie()

const clears = (response: Response, name: string): boolean =>
  setCookies(response).some((line) => line.startsWith(`${name}=;`) && /Max-Age=0/i.test(line))

const touches = (response: Response, name: string): boolean =>
  setCookies(response).some((line) => line.startsWith(`${name}=`))

const isRedirect = (response: Response): boolean => response.status >= 300 && response.status < 400

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

  it.each(['/login-help', '/loginx'])('gates %s rather than treating it as /login', (path) => {
    const response = visit(path, { cookies: { [ADMIN_COOKIE]: ADMIN } })
    expect(touches(response, ADMIN_COOKIE)).toBe(false)
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
    expect(setCookies(response)).toEqual([])
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
    expect(setCookies(tampered)).toEqual(setCookies(absent))
  })
})

describe('/login', () => {
  it('clears mt_admin on arrival, which is where every admin 401 and every sign-out lands', () => {
    expect(clears(visit('/login', { cookies: { [ADMIN_COOKIE]: 'sealed' } }), ADMIN_COOKIE)).toBe(true)
  })

  it('leaves mt_link alone, so signing out as admin keeps a client link open in another tab', () => {
    expect(touches(visit('/login', { cookies: { [LINK_COOKIE]: 'sealed' } }), LINK_COOKIE)).toBe(false)
  })

  it('does not clear mt_admin on the sign-in POST, which seals it in the same response', () => {
    expect(touches(visit('/login', { method: 'POST' }), ADMIN_COOKIE)).toBe(false)
  })

  it('is not itself redirected to /login', () => {
    expect(isRedirect(visit('/login'))).toBe(false)
  })

  it('leaves Secure off the clear over plain http, which is local dev', () => {
    const line = setCookies(visit('/login', { proto: 'http' })).find((one) => one.startsWith(`${ADMIN_COOKIE}=`))
    expect(line).toBeDefined()
    expect(line).not.toMatch(/Secure/i)
  })

  it('marks the clear Secure behind TLS, so it can displace the Secure cookie it removes', () => {
    const line = setCookies(visit('/login')).find((one) => one.startsWith(`${ADMIN_COOKIE}=`))
    expect(line).toMatch(/Secure/i)
    expect(line).toMatch(/Path=\//i)
    expect(line).toMatch(/HttpOnly/i)
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

  it('clears mt_link on arrival at the terminal page, so a reload does not retry a dead token', () => {
    expect(clears(visit(LINK_UNAVAILABLE_PATH, { cookies: { [LINK_COOKIE]: 'sealed' } }), LINK_COOKIE)).toBe(true)
  })

  it('leaves mt_admin alone at the terminal page', () => {
    expect(touches(visit(LINK_UNAVAILABLE_PATH, { cookies: { [ADMIN_COOKIE]: 'sealed' } }), ADMIN_COOKIE)).toBe(false)
  })

  it.each(['/s', '/share'])('never sends the bare %s to /login', (path) => {
    expect(isRedirect(visit(path))).toBe(false)
  })

  it('does not clear mt_link on a token that merely begins with the terminal page name', () => {
    expect(touches(visit(`${LINK_UNAVAILABLE_PATH}x`, { cookies: { [LINK_COOKIE]: 'sealed' } }), LINK_COOKIE)).toBe(false)
  })

  it('does not clear mt_link on an ordinary client route', () => {
    expect(touches(visit('/s/sometoken', { cookies: { [LINK_COOKIE]: 'sealed' } }), LINK_COOKIE)).toBe(false)
  })

  it.each(['/sales', '/shared-notes', '/s-and-p'])('treats %s as an admin route, by whole segment', (path) => {
    expect(isRedirect(visit(path))).toBe(true)
  })
})

describe('config', () => {
  it('keeps build assets out of the matcher', () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)'])
  })
})
