import { beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('readZoom answers the rung the reader chose, and says so when they never chose one', () => {
  it('reads the cookie this app owns, under the mp_ prefix every other one uses', () => {
    expect(ZOOM_COOKIE).toBe('mp_zoom')
  })

  // The cookie jar in this file answers for `mp_zoom` and for nothing else, so a rung coming back at
  // all is also the proof that this reads the name it exports — the name `chooseZoom` writes.
  it('answers each of the three rungs a person can choose', async () => {
    for (const rung of ['epic', 'feature', 'item'] as const) {
      stored = rung
      await expect(readZoom()).resolves.toBe(rung)
    }
  })

  // Not a default, because the right default depends on the plan and this function has never seen one:
  // `zoomFor` turns the null into `openingZoom(plan)`, the finest scale the plan nearly fits. Answering
  // a rung here is what drew a sixteen-day plan across a quarter of axis, bars huddled in the first
  // ninety pixels of eleven hundred.
  it('answers null when nobody has chosen a rung, leaving the opening scale to the plan that is being drawn', async () => {
    await expect(readZoom()).resolves.toBeNull()
  })

  // The whole reason the null exists. `zoomFor` branches on exactly this distinction, and 'feature' is
  // the rung that used to stand in for both halves of it.
  it('keeps "never chose" apart from "chose the middle rung", which one defaulted value could not', async () => {
    const unset = await readZoom()
    stored = 'feature'
    const picked = await readZoom()
    expect(unset).toBeNull()
    expect(picked).toBe('feature')
  })

  // The cookie is client-writable, so this is a trust boundary and not a formality: without the
  // validation a `ZOOM_VIEW` lookup would miss and the canvas would be asked to draw at no scale. Junk
  // gets the same null an unset cookie gets, which is the honest reading of it — a browser carrying
  // `mp_zoom=quarter` has named no rung the canvas can draw — and it leaves the caller one branch
  // rather than two. Note that nothing is trimmed or lowercased on the way through: a near-miss is a
  // miss, because guessing which rung was meant is the guessing this refuses to do.
  it('answers null for a value nobody could have chosen, rather than guessing which rung was meant', async () => {
    for (const junk of ['', 'EPIC', 'quarter', 'year', '../../etc/passwd', '{}', ' feature']) {
      stored = junk
      await expect(readZoom()).resolves.toBeNull()
    }
  })
})
