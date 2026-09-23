import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SEAT_TOKEN } from '../../../components/plan/testing/plan-fixture'
import LinkError from './error'

const boom = (): Error & { digest?: string } =>
  Object.assign(new Error(`could not read /s/${SEAT_TOKEN}`), { digest: 'abc123' })

describe('a seat page’s error boundary', () => {
  it('says one fixed sentence, and shows nothing of what was thrown', () => {
    const { container } = render(<LinkError error={boom()} retry={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toBe('This page could not be shown.')
    expect(container.textContent).not.toContain('abc123')
    expect(container.textContent).not.toContain(SEAT_TOKEN)
  })

  it('offers retry, which refreshes the server render, and calls it on the click', async () => {
    const retry = vi.fn()
    render(<LinkError error={boom()} retry={retry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('offers nothing else: no link at all, and so none to /login', () => {
    const { container } = render(<LinkError error={boom()} retry={vi.fn()} />)
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })
})
