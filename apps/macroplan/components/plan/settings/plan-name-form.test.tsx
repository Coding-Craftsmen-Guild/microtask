import { NO_ANSWER } from '@repo/app-session/no-answer'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PLAN_A } from '../testing/plan-fixture'
import { PLAN_NAME_HINTS, PlanNameForm } from './plan-name-form'

const stored = (name: string) => ({ ok: true, value: name }) as const

const setup = (rename = vi.fn().mockResolvedValue(stored('Atlas'))) => {
  render(<PlanNameForm name="Atlas" planId={PLAN_A} rename={rename} />)
  return { rename, user: userEvent.setup() }
}

const field = () => screen.getByLabelText<HTMLInputElement>('Plan name')

describe('PlanNameForm', () => {
  it('renames on blur rather than per keystroke, so one rename is one request', async () => {
    const { rename, user } = setup()
    await user.clear(field())
    await user.type(field(), 'Atlas rebuild')
    expect(rename).not.toHaveBeenCalled()
    await user.tab()
    expect(rename).toHaveBeenCalledExactlyOnceWith(PLAN_A, 'Atlas rebuild')
  })

  it('sends nothing at all when the name did not change, so tabbing through is free', async () => {
    const { rename, user } = setup()
    await user.click(field())
    await user.tab()
    expect(rename).not.toHaveBeenCalled()
  })

  it('refuses an empty name here rather than sending one, and puts the stored name back', async () => {
    const { rename, user } = setup()
    await user.clear(field())
    await user.tab()
    expect(rename).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toBe(PLAN_NAME_HINTS.empty)
    expect(field().value).toBe('Atlas')
  })

  // The whole reason `renamePlan` answers a string: the server collapses whitespace runs, so a field that
  // kept showing what was typed would show a name the plan does not have.
  it('repaints from the name the server stored, not from the one that was typed', async () => {
    const { user } = setup(vi.fn().mockResolvedValue(stored('Atlas rebuild')))
    await user.clear(field())
    await user.type(field(), 'Atlas    rebuild')
    await user.tab()
    expect(field().value).toBe('Atlas rebuild')
  })

  it('says the refusal and reverts, so the field never holds a name the plan does not have', async () => {
    const { user } = setup(vi.fn().mockResolvedValue({ ok: false, status: 403, detail: 'Not yours' }))
    await user.clear(field())
    await user.type(field(), 'Somebody else’s plan')
    await user.tab()
    expect((await screen.findByRole('alert')).textContent).toBe('Not yours')
    expect(field().value).toBe('Atlas')
  })

  it('says something when the action answered nothing at all, rather than looking saved', async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new Error('offline')))
    await user.clear(field())
    await user.type(field(), 'Atlas two')
    await user.tab()
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
  })
})
