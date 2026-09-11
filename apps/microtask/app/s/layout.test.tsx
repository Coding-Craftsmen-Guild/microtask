import { describe, expect, it } from 'vitest'
import LinkSurfaceLayout, { metadata } from './layout'

describe('the /s/* subtree', () => {
  it('is noindex and nofollow, for every page under it rather than one', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('asks for no referrer, so a page that links out does not send its token-bearing URL', () => {
    expect(metadata.referrer).toBe('no-referrer')
  })

  it('passes its page through untouched', () => {
    const children = <p>page</p>
    expect(LinkSurfaceLayout({ children })).toBe(children)
  })
})
