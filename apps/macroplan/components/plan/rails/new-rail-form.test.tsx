import { NO_ANSWER } from '@repo/app-session/no-answer'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PLAN_A, atlasPlan } from '../testing/plan-fixture'
import { NEW_RAIL_WORDS, NewRailForm } from './new-rail-form'
import { RAIL_PALETTE } from './rail-palette'

const setup = (create = vi.fn().mockResolvedValue({ ok: true, value: atlasPlan() })) => {
  render(<NewRailForm colour={RAIL_PALETTE[1] ?? ""} create={create} planId={PLAN_A} />)
  return {
    create,
    user: userEvent.setup(),
    field: screen.getByLabelText<HTMLInputElement>(NEW_RAIL_WORDS.label),
    button: screen.getByRole('button', { name: NEW_RAIL_WORDS.action }),
  }
}

describe('NewRailForm', () => {
  // The hue used to be the service's to pick, and it picked the same blue every time — so a plan of
  // five rails drew five rails of identical bars and the colour channel carried nothing. The domain
  // still decides nothing about how a plan looks; it says "a caller that wants a hue sends one", and
  // this is the caller doing that. `rail-palette.ts` carries the argument.
  it('sends the trimmed name and the hue it was proposed, so two rails do not look alike', async () => {
    const { create, user, field, button } = setup()
    await user.type(field, '  Billing  ')
    await user.click(button)
    expect(create).toHaveBeenCalledExactlyOnceWith(PLAN_A, {
      colour: RAIL_PALETTE[1],
      name: 'Billing',
    })
  })

  it('empties the box on success, the new rail being visible in the list instead', async () => {
    const { user, field, button } = setup()
    await user.type(field, 'Billing')
    await user.click(button)
    expect(field.value).toBe('')
  })

  it('refuses a name of nothing but whitespace here, making no request', async () => {
    const { create, user, field, button } = setup()
    await user.type(field, '   ')
    await user.click(button)
    expect(create).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(NEW_RAIL_WORDS.empty)
  })

  it('keeps what was typed and says why when the API refuses, a plan at its cap answering 422', async () => {
    const { user, field, button } = setup(
      vi.fn().mockResolvedValue({ ok: false, status: 422, detail: 'Too many rails' }),
    )
    await user.type(field, 'Billing')
    await user.click(button)
    expect((await screen.findByRole('alert')).textContent).toBe('Too many rails')
    expect(field.value).toBe('Billing')
  })

  it('says so when the server never answers, rather than throwing', async () => {
    const { user, field, button } = setup(vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    await user.type(field, 'Billing')
    await user.click(button)
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
  })

  it('caps the name at what the API accepts, since it truncates past that and answers 200', () => {
    const { field } = setup()
    expect(field.maxLength).toBe(80)
  })
})
