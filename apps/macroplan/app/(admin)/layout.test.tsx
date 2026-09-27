import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminLayout from './layout'

vi.mock('../../components/shared/sign-out-form', () => ({
  SignOutForm: () => <button type="submit">Sign out</button>,
}))

describe('the admin frame', () => {
  it('names this product in the brand bar, not the other one', () => {
    render(<AdminLayout>body</AdminLayout>)
    expect(screen.getByText('Macroplan')).toBeTruthy()
    expect(screen.queryByText('Microtask')).toBeNull()
  })

  it('carries the CC Guild lockup and the mark at bar size', () => {
    render(<AdminLayout>body</AdminLayout>)
    expect(screen.getByText('CC Guild')).toBeTruthy()
    expect(screen.getByAltText('CC Guild logo').getAttribute('width')).toBe('34')
  })

  it('offers Sign out on every admin page', () => {
    render(<AdminLayout>body</AdminLayout>)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it('links nowhere from the bar, because there is no second page to reach yet', () => {
    const { container } = render(<AdminLayout>body</AdminLayout>)
    const hrefs = [...container.querySelectorAll('a')].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(['/'])
  })

  it('puts the page body inside the main landmark', () => {
    render(<AdminLayout>body text</AdminLayout>)
    expect(screen.getByRole('main').textContent).toContain('body text')
  })

  it('stands the bar and the page body in one column exactly one viewport tall, so a page can scroll inside its own panes', () => {
    const { container } = render(<AdminLayout>body</AdminLayout>)
    const frame = container.firstElementChild
    expect(frame?.className).toContain('flex-col')
    expect(frame?.className).toContain('h-dvh')
    // `h-dvh`, never `min-h-dvh`: a floor would let the column grow with its content and hand the
    // document the scrollbar back, which is the one thing the plan page's panes cannot share.
    expect(frame?.className).not.toContain('min-h-dvh')
    expect([...(frame?.children ?? [])].map((child) => child.tagName)).toEqual(['HEADER', 'MAIN'])
  })

  it('runs the bar to the viewport edges, so the lockup and Sign out sit at the ends of the bar rather than mid-page', () => {
    const { container } = render(<AdminLayout>body</AdminLayout>)
    const row = container.querySelector('header > div')
    expect(row?.className).toContain('w-full')
    expect(row?.className).not.toContain('max-w-[900px]')
  })

  it('gives the page body the whole width and no padding of its own, because this surface’s page is an application frame', () => {
    const { container } = render(<AdminLayout>body</AdminLayout>)
    const main = container.querySelector('main')
    expect(main?.className).toContain('w-full')
    expect(main?.className).not.toContain('max-w-[900px]')
    // Legacy's 20px sides and 80px bottom are gone with the document shape: that bottom padding is
    // what put a second scrollbar on a page already managing its own. A page that still wants
    // legacy's column pads and caps itself — the plan list does, with `COLUMN`.
    expect(main?.className).not.toContain('px-5')
    expect(main?.className).not.toContain('pb-20')
  })
})
