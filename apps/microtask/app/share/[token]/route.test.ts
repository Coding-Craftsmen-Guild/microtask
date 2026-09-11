import { describe, expect, it } from 'vitest'
import { GET } from './route'

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'

const visit = (path: string, token: string): Promise<Response> =>
  GET(new Request(`https://microtask.example${path}`), { params: Promise.resolve({ token }) })

describe('GET /share/<token>', () => {
  it('answers 308 to /s/<token>, for the links already in clients’ hands', async () => {
    const response = await visit(`/share/${TOKEN}`, TOKEN)
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(`/s/${TOKEN}`)
  })

  it('carries the query string, so a legacy ?tab= still opens its tab', async () => {
    const response = await visit(`/share/${TOKEN}?tab=01M240FB4GD6PF6V0PKZVF6FDA`, TOKEN)
    expect(response.headers.get('location')).toBe(`/s/${TOKEN}?tab=01M240FB4GD6PF6V0PKZVF6FDA`)
  })

  it('answers a path rather than an absolute URL, so it names no host the proxy did not', async () => {
    const response = await visit(`/share/${TOKEN}`, TOKEN)
    expect(response.headers.get('location')?.startsWith('/s/')).toBe(true)
  })

  it('encodes the segment it did not validate, so it cannot become a second path segment', async () => {
    const response = await visit('/share/a%2F..%2Fp', 'a/../p')
    expect(response.headers.get('location')).toBe('/s/a%2F..%2Fp')
  })

  it('carries the client surface’s hardening, since its own URL holds the token too', async () => {
    const response = await visit(`/share/${TOKEN}`, TOKEN)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})
