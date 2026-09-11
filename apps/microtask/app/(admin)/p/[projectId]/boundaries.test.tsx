import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ProjectError from './error'
import ProjectLoading from './loading'
import ProjectNotFound from './not-found'

describe('the project page’s boundaries', () => {
  it('loads with one muted line and no skeleton', () => {
    const { container } = render(<ProjectLoading />)
    expect(container.textContent).toBe('Loading…')
  })

  it('says a missing project is not found, and offers the way back', () => {
    render(<ProjectNotFound />)
    expect(screen.getByRole('heading', { name: 'Project not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '← Projects' }).getAttribute('href')).toBe('/')
  })

  it('says the project could not be shown, without the thrown message, and retries on request', async () => {
    const retry = vi.fn()
    render(<ProjectError error={new Error('secret internals')} retry={retry} />)
    expect(screen.getByRole('alert').textContent).not.toContain('secret internals')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
