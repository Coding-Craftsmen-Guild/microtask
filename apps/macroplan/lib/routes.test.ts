import { describe, expect, it } from 'vitest'
import { ShareToken } from '@repo/contracts'
import { LINK_ROOT, LINK_UNAVAILABLE_PATH, isLinkSurface, linkPath, planPath } from './routes'

const TOKEN = 'tok_A_PLAN_SEAT_0001'

describe('what counts as the link surface', () => {
  it.each([LINK_ROOT, linkPath(TOKEN), `${linkPath(TOKEN)}/anything`, `${LINK_ROOT}/`])(
    'claims %s, so no cookie is asked for there',
    (pathname) => {
      expect(isLinkSurface(pathname)).toBe(true)
    },
  )

  it('claims the terminal page, which is reached by redirect and must not be gated', () => {
    expect(isLinkSurface(LINK_UNAVAILABLE_PATH)).toBe(true)
  })

  it.each([
    '/splash',
    '/sales',
    '/settings',
    '/s-and-p',
    '/',
    '/login',
    '/plans',
    planPath('01M240ERCRWWCN16Q5AHP1FZAQ'),
  ])('leaves %s on the admin surface, matching by whole segment', (pathname) => {
    expect(isLinkSurface(pathname)).toBe(false)
  })

  it('knows nothing of /share, which is Microtask’s legacy spelling and not an address here', () => {
    expect(isLinkSurface('/share')).toBe(false)
    expect(isLinkSurface(`/share/${TOKEN}`)).toBe(false)
  })
})

describe('the terminal page cannot shadow a real link', () => {
  it('is a segment no share token can hold, being shorter than the shortest', () => {
    const segment = LINK_UNAVAILABLE_PATH.slice(`${LINK_ROOT}/`.length)
    expect(segment).toBe('unavailable')
    expect(ShareToken.safeParse(segment).success).toBe(false)
  })

  it('sits inside the root, so one set of link-surface headers covers it', () => {
    expect(LINK_UNAVAILABLE_PATH.startsWith(`${LINK_ROOT}/`)).toBe(true)
  })
})

describe('building a path', () => {
  it('sends a plan seat to its own token', () => {
    expect(linkPath(TOKEN)).toBe(`/s/${TOKEN}`)
  })

  it('leaves a real token untouched, since a share token needs no encoding', () => {
    expect(ShareToken.safeParse(TOKEN).success).toBe(true)
    expect(linkPath(TOKEN)).toBe(`/s/${TOKEN}`)
  })

  it.each([
    ['../../etc', '/s/..%2F..%2Fetc'],
    ['a b', '/s/a%20b'],
    ['a?b#c', '/s/a%3Fb%23c'],
  ])('encodes %s rather than letting it reach the router as structure', (token, expected) => {
    expect(linkPath(token)).toBe(expected)
  })

  it('encodes a plan id the same way, and leaves a ULID as it is', () => {
    expect(planPath('01M240ERCRWWCN16Q5AHP1FZAQ')).toBe('/plans/01M240ERCRWWCN16Q5AHP1FZAQ')
    expect(planPath('../plans')).toBe('/plans/..%2Fplans')
  })

  it('never builds an admin path that the link surface would claim', () => {
    expect(isLinkSurface(planPath('01M240ERCRWWCN16Q5AHP1FZAQ'))).toBe(false)
  })
})
