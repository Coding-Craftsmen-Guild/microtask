// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rememberZoom, ZOOM_COOKIE } from './zoom-cookie'

afterEach(() => vi.restoreAllMocks())

const written = (): string[] => {
  const writes: string[] = []
  vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => {
    writes.push(value)
  })
  return writes
}

describe('rememberZoom keeps the chosen rung for this browser, from the browser', () => {
  it('names the cookie the server reads the next page load from', () => {
    expect(ZOOM_COOKIE).toBe('mp_zoom')
  })

  it('writes the rung for the whole site, for a year, lax, exactly as the action it replaces did', () => {
    const writes = written()
    rememberZoom('item')
    expect(writes).toEqual(['mp_zoom=item; path=/; max-age=31536000; samesite=lax'])
  })
})
