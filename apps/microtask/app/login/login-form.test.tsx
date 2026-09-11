import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOGIN_REFUSED, type SignInState } from '../../lib/login'

const signIn = vi.fn<(previous: SignInState, form: FormData) => Promise<SignInState>>()

vi.mock('../../actions/auth', () => ({
  signIn: (previous: SignInState, form: FormData) => signIn(previous, form),
}))

const { LoginForm } = await import('./login-form')

beforeEach(() => {
  signIn.mockReset()
})

describe('LoginForm', () => {
  it('asks for the admin password and nothing else', () => {
    render(<LoginForm next="/" />)
    const password = screen.getByPlaceholderText('Admin password')
    expect(password).toHaveProperty('type', 'password')
    expect(password).toHaveProperty('required', true)
    expect(password).toHaveProperty('name', 'password')
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })

  it('carries the sanitised next through the form', () => {
    const { container } = render(<LoginForm next="/p/01HXYZ" />)
    const hidden = container.querySelector('input[type="hidden"][name="next"]')
    expect(hidden).toHaveProperty('value', '/p/01HXYZ')
  })

  it('shows no message before the first attempt', () => {
    render(<LoginForm next="/" />)
    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('')
  })

  it('shows the refusal the action returned, and posts the password and next', async () => {
    signIn.mockResolvedValue({ message: LOGIN_REFUSED })
    render(<LoginForm next="/p/01HXYZ" />)
    await userEvent.type(screen.getByPlaceholderText('Admin password'), 'guess')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(LOGIN_REFUSED)).toBeTruthy()
    const sent = signIn.mock.calls[0]?.[1]
    expect(sent?.get('password')).toBe('guess')
    expect(sent?.get('next')).toBe('/p/01HXYZ')
  })

  it('never renders the literal text "null" for an empty message', () => {
    const { container } = render(<LoginForm next="/" />)
    expect(container.textContent).not.toContain('null')
  })
})
