import { NO_ANSWER } from '@repo/app-session/no-answer'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PLAN_A, atlasPlan } from '../testing/plan-fixture'
import { TIMING_HINTS, TimingForm } from './timing-form'
import { TIMING_WORDS } from './timing-fields'

const answered = { ok: true, value: atlasPlan() } as const

const setup = (retime = vi.fn().mockResolvedValue(answered)) => {
  render(
    <TimingForm
      planId={PLAN_A}
      retime={retime}
      sprintLengthDays={10}
      startDate="2026-01-05"
      timezone="UTC"
    />,
  )
  return { retime, user: userEvent.setup() }
}

const start = () => screen.getByLabelText<HTMLInputElement>(TIMING_WORDS.start)

const sprint = () => screen.getByLabelText<HTMLInputElement>(TIMING_WORDS.sprint)

const zone = () => screen.getByLabelText<HTMLInputElement>(TIMING_WORDS.zone)

const press = () => screen.getByRole('button', { name: 'Retime' })

describe('TimingForm', () => {
  // The one form in the app that sends more than one field, and it may because all three meet one gate:
  // the API asks `plan:retime` for any of them. A `name` would need `plan:rename` as well, which is why
  // `retimePlan` cannot send one.
  it('sends every changed field in one request, all three meeting one gate', async () => {
    const { retime, user } = setup()
    await user.clear(sprint())
    await user.type(sprint(), '14')
    await user.clear(zone())
    await user.type(zone(), 'Europe/Belgrade')
    await user.click(press())
    expect(retime).toHaveBeenCalledExactlyOnceWith(PLAN_A, {
      sprintLengthDays: 14,
      timezone: 'Europe/Belgrade',
    })
  })

  it('sends only what changed, so a field left alone is not restated', async () => {
    const { retime, user } = setup()
    await user.clear(sprint())
    await user.type(sprint(), '14')
    await user.click(press())
    expect(retime).toHaveBeenCalledExactlyOnceWith(PLAN_A, { sprintLengthDays: 14 })
  })

  // Not a 422 from an empty body: the API refuses a `PATCH` with no fields, and the sentence somebody
  // needs is that nothing changed rather than a validation error about a request they did not know was
  // empty.
  it('says nothing changed rather than sending an empty body the API would refuse', async () => {
    const { retime, user } = setup()
    await user.click(press())
    expect(retime).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(TIMING_HINTS.unchanged)
  })

  // Held locally and sent on a press, not on blur: three fields that move every bar together are one
  // decision, and tabbing between them would retime the plan twice and redraw it in between.
  it('waits for the button rather than committing as focus leaves a field', async () => {
    const { retime, user } = setup()
    await user.clear(start())
    await user.type(start(), '2026-02-02')
    await user.tab()
    expect(retime).not.toHaveBeenCalled()
  })

  it('says the refusal in the API’s own words, a timezone this runtime cannot resolve included', async () => {
    const detail = 'timezone: must be a time zone this runtime can resolve'
    const { user } = setup(vi.fn().mockResolvedValue({ ok: false, status: 422, detail }))
    await user.clear(zone())
    await user.type(zone(), 'Mars/Olympus')
    await user.click(press())
    expect((await screen.findByRole('alert')).textContent).toBe(detail)
  })

  it('says something when the action answered nothing at all', async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new Error('offline')))
    await user.clear(sprint())
    await user.type(sprint(), '12')
    await user.click(press())
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
  })

  it('says what retiming does, because it moves every bar without touching one', () => {
    setup()
    expect(screen.getByText(TIMING_WORDS.effect)).toBeDefined()
  })
})
