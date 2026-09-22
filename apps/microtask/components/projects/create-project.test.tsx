import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionFailure } from '../../actions/result'
import { NO_ANSWER } from '@repo/app-session/no-answer'
import { CreateProject } from './create-project'

const setup = (answer: ActionFailure | undefined = undefined) => {
  const onCreate = vi.fn<(name: string) => Promise<ActionFailure | undefined>>().mockResolvedValue(answer)
  render(<CreateProject onCreate={onCreate} />)
  return { onCreate, user: userEvent.setup(), field: screen.getByRole<HTMLInputElement>('textbox') }
}

describe('CreateProject', () => {
  it('sends the trimmed name on Enter', async () => {
    const { onCreate, user, field } = setup()
    await user.type(field, '  ACME Website  {Enter}')
    expect(onCreate).toHaveBeenCalledWith('ACME Website')
  })

  it('sends from the gold button too', async () => {
    const { onCreate, user, field } = setup()
    await user.type(field, 'ACME')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(onCreate).toHaveBeenCalledWith('ACME')
  })

  it('makes no request for a name that is only whitespace', async () => {
    const { onCreate, user, field } = setup()
    await user.type(field, '    {Enter}')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('keeps what was typed and says why when the create is refused', async () => {
    const { user, field } = setup({ ok: false, status: 422, detail: 'Too many projects' })
    await user.type(field, 'ACME{Enter}')
    expect(field.value).toBe('ACME')
    expect(screen.getByRole('alert').textContent).toBe('Too many projects')
  })

  it('keeps what was typed and says so when the server never answers, rather than throwing', async () => {
    const onCreate = vi.fn<(name: string) => Promise<ActionFailure | undefined>>(() => Promise.reject(new TypeError('Failed to fetch')))
    render(<CreateProject onCreate={onCreate} />)
    const field = screen.getByRole<HTMLInputElement>('textbox')
    await userEvent.setup().type(field, 'ACME{Enter}')
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(field.value).toBe('ACME')
    expect(screen.getByRole('button', { name: 'Create project' })).toHaveProperty('disabled', false)
  })

  it('carries legacy’s placeholder and the name cap the API accepts', () => {
    const { field } = setup()
    expect(field.placeholder).toBe('New project name — e.g. ACME Website')
    expect(field.maxLength).toBe(80)
  })
})
