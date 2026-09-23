import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTION_REFUSALS } from '../../../lib/refusal'
import { LINK_UNAVAILABLE_PATH } from '../../../lib/routes'

const consulted: string[] = []

// Not a throwing mock, because the assertion here is different: the terminal page must consult
// nothing at all, and a record of what it asked for says so more precisely than a failure would.
vi.mock('next/headers', () => ({
  cookies: () => {
    consulted.push('cookies')
    return Promise.resolve({ get: () => undefined, set: () => undefined })
  },
  headers: () => {
    consulted.push('headers')
    return Promise.resolve(new Headers())
  },
}))

const fetched = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetched)
  consulted.length = 0
  fetched.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const { default: LinkUnavailablePage, metadata } = await import('./page')

describe('/s/unavailable', () => {
  it('says the link is no longer available, in the words a link 401 has in this app', () => {
    render(<LinkUnavailablePage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Link unavailable')
    expect(screen.getByText(ACTION_REFUSALS.link.unauthorised)).toBeTruthy()
  })

  it('calls nothing and reads nothing, so a reload cannot re-attempt the dead link', () => {
    render(<LinkUnavailablePage />)
    expect(fetched).not.toHaveBeenCalled()
    expect(consulted).toEqual([])
  })

  it('never offers a password form: its one link is to itself, and there is no form', () => {
    const { container } = render(<LinkUnavailablePage />)
    expect([...container.querySelectorAll('a')].map((one) => one.getAttribute('href'))).toEqual([
      LINK_UNAVAILABLE_PATH,
    ])
    expect(container.querySelector('form')).toBeNull()
  })

  it('says those two things and nothing else of its own, taking no props to say more from', () => {
    render(<LinkUnavailablePage />)
    const main = screen.getByRole('main')
    expect(main.querySelectorAll('h1')).toHaveLength(1)
    expect(main.textContent).toBe(`Link unavailable${ACTION_REFUSALS.link.unauthorised}`)
  })

  it('caps its prose at the column, under a frame that is wide for the timeline', () => {
    const { container } = render(<LinkUnavailablePage />)
    expect(container.querySelector('main [class*="max-w-[900px]"]')).toBeTruthy()
  })

  it('titles the tab with the same words as its heading', () => {
    expect(metadata).toEqual({ title: 'Link unavailable · CC Guild Macroplan' })
  })
})
