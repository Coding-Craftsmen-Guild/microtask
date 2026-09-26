import { NO_ANSWER } from '@repo/app-session/no-answer'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionFailure } from '../../actions/result'
import { CREATE_PLAN_WORDS, CreatePlan } from './create-plan'

const TODAY = '2026-09-26'

type Draft = { readonly name: string; readonly startDate: string }

type OnCreate = (plan: Draft) => Promise<ActionFailure | undefined>

const setup = (answer: ActionFailure | undefined = undefined) => {
  const onCreate = vi.fn<OnCreate>().mockResolvedValue(answer)
  render(<CreatePlan onCreate={onCreate} today={TODAY} />)
  return {
    onCreate,
    user: userEvent.setup(),
    name: screen.getByLabelText<HTMLInputElement>(CREATE_PLAN_WORDS.name),
    start: screen.getByLabelText<HTMLInputElement>(CREATE_PLAN_WORDS.start),
    button: screen.getByRole('button', { name: CREATE_PLAN_WORDS.submit }),
  }
}

describe('CreatePlan', () => {
  it('opens dated today, so the one date a plan cannot derive is already answered', () => {
    const { start } = setup()
    expect(start.value).toBe(TODAY)
  })

  it('sends the trimmed name with that date on Enter', async () => {
    const { onCreate, user, name } = setup()
    await user.type(name, '  ACME Q4 delivery  {Enter}')
    expect(onCreate).toHaveBeenCalledWith({ name: 'ACME Q4 delivery', startDate: TODAY })
  })

  it('sends the date the admin picked instead of the one it opened with', async () => {
    const { onCreate, user, name, start, button } = setup()
    await user.clear(start)
    await user.type(start, '2027-01-04')
    await user.type(name, 'ACME')
    await user.click(button)
    expect(onCreate).toHaveBeenCalledWith({ name: 'ACME', startDate: '2027-01-04' })
  })

  it('sends neither of the two settings the service defaults, so a plan gets the product default', async () => {
    const { onCreate, user, name } = setup()
    await user.type(name, 'ACME{Enter}')
    expect(Object.keys(onCreate.mock.calls[0]?.[0] ?? {}).sort()).toEqual(['name', 'startDate'])
  })

  it('makes no request for a name that is only whitespace', async () => {
    const { onCreate, user, name } = setup()
    await user.type(name, '    {Enter}')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('is blocked by the browser with no first working day, so none is ever sent', async () => {
    const { onCreate, user, name, start, button } = setup()
    await user.clear(start)
    await user.type(name, 'ACME')
    await user.click(button)
    expect(onCreate).not.toHaveBeenCalled()
    expect(start.required).toBe(true)
  })

  it('keeps what was typed and says why when the create is refused', async () => {
    const { user, name } = setup({ ok: false, status: 422, detail: 'Too many plans' })
    await user.type(name, 'ACME{Enter}')
    expect(name.value).toBe('ACME')
    expect(screen.getByRole('alert').textContent).toBe('Too many plans')
  })

  it('keeps what was typed and says so when the server never answers, rather than throwing', async () => {
    const onCreate = vi.fn<OnCreate>(() => Promise.reject(new TypeError('Failed to fetch')))
    render(<CreatePlan onCreate={onCreate} today={TODAY} />)
    const name = screen.getByLabelText<HTMLInputElement>(CREATE_PLAN_WORDS.name)
    await userEvent.setup().type(name, 'ACME{Enter}')
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(name.value).toBe('ACME')
    expect(screen.getByRole('button', { name: CREATE_PLAN_WORDS.submit })).toHaveProperty(
      'disabled',
      false,
    )
  })

  it('caps the name at what the API accepts, so a paste is cut here rather than truncated there', () => {
    const { name } = setup()
    expect(name.maxLength).toBe(80)
  })
})
