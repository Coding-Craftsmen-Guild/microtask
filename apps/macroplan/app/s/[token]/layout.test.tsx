import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SEAT_TOKEN } from '../../../components/plan/testing/plan-fixture'
import { linkPath } from '../../../lib/routes'

// A layout on this surface reads its own `params` and nothing else; a cookie read here would fail.
vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('a seat layout must not read a cookie')
  },
  headers: () => {
    throw new Error('a seat layout must not read a header')
  },
}))

const { default: LinkLayout } = await import('./layout')

const frame = async (token = SEAT_TOKEN) =>
  render(await LinkLayout({ params: Promise.resolve({ token }), children: <p>page</p> }))

describe('the seat frame', () => {
  it('links the brand to this link’s own page, never to / — the admin surface and its password form', async () => {
    const { container } = await frame()
    expect([...container.querySelectorAll('a')].map((one) => one.getAttribute('href'))).toEqual([
      `/s/${SEAT_TOKEN}`,
    ])
  })

  it('links it through the same function the redirects use, which encodes the segment', async () => {
    const odd = 'a_token_with_a_%_in_it'
    const { container } = await frame(odd)
    expect(container.querySelector('a')?.getAttribute('href')).toBe(linkPath(odd))
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/s/a_token_with_a_%25_in_it')
  })

  it('has no Sign out, because a plan seat has no session to end', async () => {
    const { container } = await frame()
    expect(container.textContent).not.toContain('Sign out')
    expect(container.querySelector('form')).toBeNull()
  })

  it('renders the page inside the one main landmark, under the brand bar', async () => {
    const { container } = await frame()
    expect(container.querySelector('header')).toBeTruthy()
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(container.querySelector('main')?.textContent).toBe('page')
  })

  it('names Macroplan in the bar, so a seat is not told it is reading the other product', async () => {
    const { container } = await frame()
    expect(container.querySelector('header')?.textContent).toContain('Macroplan')
  })
})
