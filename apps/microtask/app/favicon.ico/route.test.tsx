import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOGO_PATH } from '../../components/shared/logo'
import { GET } from './route'

const here = dirname(fileURLToPath(import.meta.url))

describe('/favicon.ico, which a browser asks for whether or not a page declares an icon', () => {
  it('redirects to the mark every page declares, rather than 404ing as it did', () => {
    const response = GET()
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(LOGO_PATH)
  })

  it('points at a file this app actually serves, under the one name the logo has', () => {
    expect(LOGO_PATH).toBe('/img/logo.webp')
    expect(existsSync(join(here, '..', '..', 'public', 'img', 'logo.webp'))).toBe(true)
  })

  it('is cacheable, so the probe is answered once rather than on every navigation', () => {
    expect(GET().headers.get('cache-control')).toMatch(/max-age=\d+/)
  })

  it('holds that cache for an hour, so the mark can be repathed the same day', () => {
    expect(GET().headers.get('cache-control')).toBe('public, max-age=3600')
  })
})
