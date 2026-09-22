import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NO_ANSWER } from '@repo/app-session/no-answer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn<() => Promise<void>>()

vi.mock('../../actions/auth', () => ({ signOut: () => signOut() }))

const { SignOutForm } = await import('./sign-out-form')

beforeEach(() => {
  signOut.mockReset()
})

describe('this app Sign out', () => {
  it('posts this app own signOut action', async () => {
    signOut.mockResolvedValue(undefined)
    render(<SignOutForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('says the server did not answer when the sign-out gets none, and stays usable', async () => {
    signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<SignOutForm />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText(NO_ANSWER.detail)).toBeTruthy()
    signOut.mockResolvedValueOnce(undefined)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(2)
  })
})
