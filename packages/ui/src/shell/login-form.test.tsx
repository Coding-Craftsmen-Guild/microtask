import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm, type SignInAction } from './login-form'

const REFUSED = 'The credentials presented were not accepted.'

const answering = (message: string | null) => vi.fn<SignInAction>(() => Promise.resolve({ message }))

describe('LoginForm', () => {
  it('asks for the admin password and nothing else', () => {
    render(<LoginForm action={answering(null)} next="/" />)
    const password = screen.getByPlaceholderText('Admin password')
    expect(password).toHaveProperty('type', 'password')
    expect(password).toHaveProperty('required', true)
    expect(password).toHaveProperty('name', 'password')
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('carries the sanitised next through the form as a hidden field', () => {
    const { container } = render(<LoginForm action={answering(null)} next="/p/01HXYZ" />)
    expect(container.querySelector('input[type="hidden"][name="next"]')).toHaveProperty('value', '/p/01HXYZ')
  })

  it('shows no message before the first attempt, and never the literal text null', () => {
    const { container } = render(<LoginForm action={answering(null)} next="/" />)
    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('')
    expect(container.textContent).not.toContain('null')
  })

  it('posts the password and the next, and shows what the action answered', async () => {
    const action = answering(REFUSED)
    render(<LoginForm action={action} next="/p/01HXYZ" />)
    await userEvent.type(screen.getByPlaceholderText('Admin password'), 'guess')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(REFUSED)).toBeTruthy()
    const sent = action.mock.calls[0]?.[1]
    expect(sent?.get('password')).toBe('guess')
    expect(sent?.get('next')).toBe('/p/01HXYZ')
  })

  it('keeps the message line in the DOM, so a refusal does not move the button', () => {
    render(<LoginForm action={answering(null)} next="/" />)
    expect(screen.getByRole('alert').className).toContain('min-h-5')
  })
})
