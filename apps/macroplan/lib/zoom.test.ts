import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ZOOM } from '../components/plan/canvas/zoom-view'
import { ZOOM_COOKIE, readZoom } from './zoom'

let stored: string | undefined

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'mp_zoom' && stored !== undefined ? { name, value: stored } : undefined,
      set: () => undefined,
    }),
}))

beforeEach(() => {
  stored = undefined
})

describe('readZoom answers the rung the canvas should draw at', () => {
  it('reads the cookie this app owns, under the mp_ prefix every other one uses', () => {
    expect(ZOOM_COOKIE).toBe('mp_zoom')
  })

  it('answers the feature rung when nothing has been chosen, which is what the canvas always drew', async () => {
    await expect(readZoom()).resolves.toBe(DEFAULT_ZOOM)
    expect(DEFAULT_ZOOM).toBe('feature')
  })

  it('answers each of the three rungs a person can choose', async () => {
    for (const rung of ['epic', 'feature', 'item'] as const) {
      stored = rung
      await expect(readZoom()).resolves.toBe(rung)
    }
  })

  // The cookie is client-writable, so this is a trust boundary and not a formality: without the
  // validation a `ZOOM_VIEW` lookup would miss and the canvas would be asked to draw at no scale.
  it('falls back to the default for a value nobody could have chosen', async () => {
    for (const junk of ['', 'EPIC', 'quarter', 'year', '../../etc/passwd', '{}']) {
      stored = junk
      await expect(readZoom()).resolves.toBe(DEFAULT_ZOOM)
    }
  })
})
