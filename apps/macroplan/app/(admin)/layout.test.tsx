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

  it('takes the viewport rather than legacy’s column, because this surface’s page is a timeline', () => {
    const { container } = render(<AdminLayout>body</AdminLayout>)
    const main = container.querySelector('main')
    expect(main?.className).not.toContain('max-w-[900px]')
    expect(main?.className).toContain('px-5')
    expect(main?.className).toContain('pb-20')
  })
})
