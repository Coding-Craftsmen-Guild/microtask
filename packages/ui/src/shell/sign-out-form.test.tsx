import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SignOutForm } from './sign-out-form'

describe('SignOutForm', () => {
  it('posts a form rather than following a link, so no prefetch can end a session', () => {
    const { container } = render(<SignOutForm action={() => Promise.resolve('')} />)
    expect(container.querySelector('form')).toBeTruthy()
    expect(container.querySelector('a')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveProperty('type', 'submit')
  })

  it('shows nothing beside the button until a sign-out fails', () => {
    render(<SignOutForm action={() => Promise.resolve('')} />)
    expect(screen.getByRole('alert').textContent).toBe('')
  })

  it('shows what the action answered and leaves the button usable', async () => {
    const action = vi.fn(() => Promise.resolve('The server did not answer.'))
    render(<SignOutForm action={action} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('The server did not answer.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(action).toHaveBeenCalledTimes(2)
  })
})
