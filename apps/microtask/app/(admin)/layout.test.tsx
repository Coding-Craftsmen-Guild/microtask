import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const signOut = vi.fn()

vi.mock('../../actions/auth', () => ({ signOut: () => signOut() }))

const { default: AdminLayout } = await import('./layout')

describe('the admin layout', () => {
  it('signs out with a form post, never a link', () => {
    render(<AdminLayout>page</AdminLayout>)
    const button = screen.getByRole('button', { name: 'Sign out' })
    expect(button.getAttribute('type')).toBe('submit')
    expect(button.closest('form')).not.toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign out' })).toBeNull()
  })

  it('renders no link to /login anywhere', () => {
    const { container } = render(<AdminLayout>page</AdminLayout>)
    expect(container.querySelector('a[href^="/login"]')).toBeNull()
  })

  it('carries the CC Guild logo in the brand bar, as every page of the app being replaced did', () => {
    render(<AdminLayout>page</AdminLayout>)
    const logo = within(screen.getByRole('banner')).getByRole('img', { name: 'CC Guild logo' })
    expect(logo.getAttribute('src')).toBe('/img/logo.webp')
  })

  it('frames the page under the brand bar, in the main landmark', () => {
    render(<AdminLayout>the page body</AdminLayout>)
    expect(screen.getByRole('banner').textContent).toContain('Microtask')
    expect(screen.getByRole('main').textContent).toBe('the page body')
  })
})
