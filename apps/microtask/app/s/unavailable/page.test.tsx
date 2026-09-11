import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const consulted: string[] = []

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
  it('says the link is unavailable, in legacy’s words', () => {
    render(<LinkUnavailablePage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Link unavailable')
    expect(screen.getByText('This share link is no longer available.')).toBeTruthy()
  })

  it('calls nothing and reads nothing, so a reload cannot re-attempt the dead link', () => {
    render(<LinkUnavailablePage />)
    expect(fetched).not.toHaveBeenCalled()
    expect(consulted).toEqual([])
  })

  it('never offers a password form: no link reaches /login or the admin surface', () => {
    const { container } = render(<LinkUnavailablePage />)
    const hrefs = [...container.querySelectorAll('a')].map((one) => one.getAttribute('href'))
    expect(hrefs).toEqual(['/s/unavailable'])
    expect(container.querySelector('form')).toBeNull()
  })

  it('titles the tab with the same words', () => {
    expect(metadata).toEqual({ title: 'Link unavailable · CC Guild Microtask' })
  })
})
