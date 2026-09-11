import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskError from './error'

describe('the task page error boundary', () => {
  it('says the task could not be shown, never the thrown message, and retries on request', async () => {
    const retry = vi.fn()
    render(<TaskError error={new Error('secret stack detail')} retry={retry} />)
    expect(screen.getByText('This task could not be shown.')).toBeTruthy()
    expect(screen.queryByText(/secret stack detail/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
