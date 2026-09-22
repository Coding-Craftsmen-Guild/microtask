import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NO_ANSWER } from '@repo/app-session/no-answer'
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

describe('this app sign-in form', () => {
  it('posts the password and the next to this app own action', async () => {
    signIn.mockResolvedValue({ message: LOGIN_REFUSED })
    render(<LoginForm next="/plans/01H" />)
    await userEvent.type(screen.getByPlaceholderText('Admin password'), 'guess')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(LOGIN_REFUSED)).toBeTruthy()
    const sent = signIn.mock.calls[0]?.[1]
    expect(sent?.get('password')).toBe('guess')
    expect(sent?.get('next')).toBe('/plans/01H')
  })

  it('says the server did not answer when the sign-in gets no answer, and lets the admin try again', async () => {
    signIn.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<LoginForm next="/" />)
    await userEvent.type(screen.getByPlaceholderText('Admin password'), 'guess')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(NO_ANSWER.detail)).toBeTruthy()
    signIn.mockResolvedValueOnce({ message: LOGIN_REFUSED })
    await userEvent.type(screen.getByPlaceholderText('Admin password'), 'guess')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(LOGIN_REFUSED)).toBeTruthy()
    expect(signIn).toHaveBeenCalledTimes(2)
  })
})
