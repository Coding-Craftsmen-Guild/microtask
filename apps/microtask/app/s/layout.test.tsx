import { describe, expect, it, vi } from 'vitest'

const connected = vi.fn(() => Promise.resolve())

vi.mock('next/server', () => ({ connection: () => connected() }))

const { default: LinkSurfaceLayout, metadata } = await import('./layout')

describe('the /s/* subtree', () => {
  it('is noindex and nofollow, for every page under it rather than one', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('asks for no referrer, so a page that links out does not send its token-bearing URL', () => {
    expect(metadata.referrer).toBe('no-referrer')
  })

  it('renders every page under it at request time, so none is served with a shared-cache lifetime', async () => {
    connected.mockClear()
    const children = <p>page</p>
    expect(await LinkSurfaceLayout({ children })).toBe(children)
    expect(connected).toHaveBeenCalledTimes(1)
  })
})
