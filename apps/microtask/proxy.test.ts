import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { ADMIN_COOKIE, LINK_COOKIE } from './lib/principal'
import { LINK_UNAVAILABLE_PATH } from './lib/routes'
import { config, proxy } from './proxy'

const ORIGIN = 'https://microtask.example'

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

  it('lets an API route through, so it answers its own 401 instead of an HTML login page', () => {
    expect(isRedirect(visit('/api/projects/01H/tasks/01H/tabs/01H/document'))).toBe(false)
  })
})

describe('the admin surface with mt_admin', () => {
  it('lets the request through without touching either cookie', () => {
    const response = visit('/p/01HXYZ', { cookies: { [ADMIN_COOKIE]: 'sealed', [LINK_COOKIE]: 'x' } })
    expect(isRedirect(response)).toBe(false)
    expect(setCookies(response)).toEqual([])
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
