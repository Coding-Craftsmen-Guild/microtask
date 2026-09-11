import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_ANSWER } from '../../components/shared/no-answer'

const signOut = vi.fn<() => Promise<void>>()

vi.mock('../../actions/auth', () => ({ signOut: () => signOut() }))

beforeEach(() => {
  signOut.mockReset()
  signOut.mockResolvedValue(undefined)
})

const { default: AdminLayout } = await import('./layout')

describe('the admin layout', () => {
  it('signs out with a form post, never a link', () => {
    render(<AdminLayout>page</AdminLayout>)
    const button = screen.getByRole('button', { name: 'Sign out' })
    expect(button.getAttribute('type')).toBe('submit')
    expect(button.closest('form')).not.toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign out' })).toBeNull()
  })

  it('posts the sign-out once per click, and says nothing while it goes through', async () => {
    render(<AdminLayout>page</AdminLayout>)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(NO_ANSWER.detail)).toBeNull()
  })

  it('says the server did not answer when the sign-out gets no answer, rather than falling to an error boundary', async () => {
    signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<AdminLayout>the page body</AdminLayout>)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(screen.getByRole('main').textContent).toBe('the page body')
  })

  it('lets the admin try again after a sign-out that got no answer', async () => {
    signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<AdminLayout>page</AdminLayout>)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByText(NO_ANSWER.detail)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(2)
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
