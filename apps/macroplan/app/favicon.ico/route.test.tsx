import { LOGO_PATH } from '@repo/ui/shell/logo'
import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('GET /favicon.ico', () => {
  it('redirects permanently to the one logo file, rather than serving a second copy', () => {
    const response = GET()
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(LOGO_PATH)
  })

  it('answers with no body at all', async () => {
    expect(await GET().text()).toBe('')
  })

  it('lets a browser cache it, so the probe is not on every navigation', () => {
    expect(GET().headers.get('cache-control')).toBe('public, max-age=3600')
  })
})
