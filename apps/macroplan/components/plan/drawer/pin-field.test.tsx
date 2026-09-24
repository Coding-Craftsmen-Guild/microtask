import { NO_ANSWER } from '@repo/app-session/no-answer'
import type { Plan } from '@repo/api-client'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { atlasPlan, FEATURE_1, PLAN_A } from '../testing/plan-fixture'
import { pinCeiling, WHOLE_SPRINTS } from './field'
import { pinHint, PinField, PIN_HINT } from './pin-field'

type Pin = (planId: string, featureId: string, pinSprint: number | null) => Promise<ActionResult<Plan>>

const PLAN = atlasPlan()

const pinned = (pinSprint: number | null): ActionResult<Plan> => ({
  ok: true,
  value: atlasPlan({
    features: atlasPlan().features.map((one) =>
      one.id === FEATURE_1 ? { ...one, pinSprint } : one,
    ),
  }),
})

const kept: Pin = (_planId, _featureId, pinSprint) => Promise.resolve(pinned(pinSprint))

const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Pinned to sprint' })

const described = (): string =>
  (field().getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((one) => one !== '')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' | ')

const setup = (pinSprint: number | null = null, pin: Pin = kept) => {
  const onPin = vi.fn(pin)
  const view = render(
    <PinField
      featureId={FEATURE_1}
      pin={onPin}
      pinSprint={pinSprint}
      planId={PLAN_A}
      sprintLengthDays={PLAN.sprintLengthDays}
      startDate={PLAN.startDate}
      timezone={PLAN.timezone}
    />,
  )
  return { onPin, view, user: userEvent.setup() }
}

const retype = async (user: ReturnType<typeof userEvent.setup>, typed: string) => {
  await user.clear(field())
  if (typed !== '') await user.type(field(), typed)
  await user.tab()
}

describe('the two states a pin can be left in, and the number the box is counted in', () => {
  it('shows an empty box for a feature nobody pinned', () => {
    setup(null)
    expect(field().value).toBe('')
  })

  // The conversion, on screen: the table calls the plan's first sprint `S1`, so a stored 0 must read 1.
  it('shows a stored 0 as sprint 1, which is what the rest of the screen calls it', () => {
    setup(0)
    expect(field().value).toBe('1')
  })

  it('shows a stored 2 as sprint 3', () => {
    setup(2)
    expect(field().value).toBe('3')
  })

  it('sends the sprint before the one typed, so a pin lands where the label says', async () => {
    const { onPin, user } = setup(null)
    await retype(user, '3')
    expect(onPin).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 2)
  })

  it('sends null when the box is emptied, which is the unpin', async () => {
    const { onPin, user } = setup(2)
    await retype(user, '')
    expect(onPin).toHaveBeenCalledWith(PLAN_A, FEATURE_1, null)
  })

  it('sends 0 for sprint 1 where nothing was pinned, the first sprint being a real pin', async () => {
    const { onPin, user } = setup(null)
    await retype(user, '1')
    expect(onPin).toHaveBeenCalledTimes(1)
    expect(onPin).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 0)
  })

  it('sends nothing when an empty box is left empty', async () => {
    const { onPin, user } = setup(null)
    await retype(user, '')
    expect(onPin).not.toHaveBeenCalled()
  })

  it('sends nothing when the pin is left where it was, spellings included', async () => {
    const { onPin, user } = setup(2)
    await retype(user, '3')
    expect(onPin).not.toHaveBeenCalled()
    await retype(user, ' 03 ')
    expect(onPin).not.toHaveBeenCalled()
  })
})

describe('the ceiling this field owns, the contract having none at all', () => {
  it('refuses a sprint past the ceiling and sends nothing, keeping what was typed', async () => {
    const { onPin, user } = setup(null)
    await retype(user, '500')
    expect(onPin).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(
      String(pinCeiling(PLAN.sprintLengthDays)),
    )
    expect(field().value).toBe('500')
  })

  it('accepts the ceiling itself, so the refusal is a bound and not a fear of large numbers', async () => {
    const { onPin, user } = setup(null)
    await retype(user, String(pinCeiling(PLAN.sprintLengthDays)))
    expect(onPin).toHaveBeenCalledWith(PLAN_A, FEATURE_1, pinCeiling(PLAN.sprintLengthDays) - 1)
  })

  it('refuses a 0, a fraction and a word rather than reading any of them as an unpin', async () => {
    const { onPin, user } = setup(2)
    for (const typed of ['0', '2.5', 'soon']) {
      await retype(user, typed)
      expect(onPin, typed).not.toHaveBeenCalled()
      expect(screen.getByRole('alert').textContent, typed).toBe(WHOLE_SPRINTS)
    }
  })

  it('clears its own refusal once the value is fixed', async () => {
    const { onPin, user } = setup(null)
    await retype(user, '500')
    await retype(user, '4')
    expect(onPin).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 3)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('what a reader is told about the sprint a pin names', () => {
  it('says the rule and nothing about dates while the box is empty', () => {
    setup(null)
    expect(described()).toBe(PIN_HINT)
  })

  // The inclusive end, on screen. Atlas runs fortnights from Monday 2026-09-28, so its first sprint's
  // fourteen working days end on Friday 2026-10-15 — not on the Monday after, which is what reading
  // `rangeOfSprint`'s `to` as an exclusive `endDay` would have printed.
  it('names the first and last day of the stored sprint, the range being inclusive', () => {
    setup(0)
    expect(described()).toContain('Sprint 1 runs 2026-09-28 to 2026-10-15')
    expect(described()).toContain('both days included')
    expect(described()).not.toContain('2026-10-16')
  })

  it('re-dates the sprint as the number is typed, before anything is committed', async () => {
    const { onPin, user } = setup(0)
    await user.clear(field())
    await user.type(field(), '3')
    expect(described()).toContain('Sprint 3 runs 2026-11-05 to 2026-11-24')
    expect(onPin).not.toHaveBeenCalled()
  })

  it('falls back to the rule while the box holds something it would refuse', async () => {
    const { user } = setup(0)
    await user.clear(field())
    await user.type(field(), 'soon')
    expect(described()).toContain(PIN_HINT)
    expect(described()).not.toContain('runs')
  })

  it('describes the field by the hint and then the refusal, which is reading order', async () => {
    const { user } = setup(null)
    await retype(user, '500')
    expect(described()).toBe(`${PIN_HINT} | ${screen.getByRole('alert').textContent ?? ''}`)
    expect(field().getAttribute('aria-invalid')).toBe('true')
  })

  it('says a pin only delays, that being the whole of what the forward pass does with one', () => {
    setup(2)
    expect(described()).toContain('never moves one earlier')
  })
})

describe('what is on screen once the server has answered', () => {
  it('shows the pin the answered plan holds, not the number that was sent', async () => {
    const { user } = setup(null, () => Promise.resolve(pinned(5)))
    await retype(user, '3')
    expect(field().value).toBe('6')
  })

  it('shows an empty box when the answered plan holds no pin for it', async () => {
    const { user } = setup(2, () => Promise.resolve(pinned(null)))
    await retype(user, '4')
    expect(field().value).toBe('')
  })

  it('re-dates the hint from the answer rather than from what was typed', async () => {
    const { user } = setup(null, () => Promise.resolve(pinned(0)))
    await retype(user, '9')
    expect(described()).toContain('Sprint 1 runs 2026-09-28')
  })

  // The refusal a `write` seat meets on this field and on neither of its two neighbours.
  it('restores the stored pin and says why when the server refuses the write', async () => {
    const { user } = setup(2, () =>
      Promise.resolve({ ok: false, status: 403, detail: 'Not permitted: feature:pin' }),
    )
    await retype(user, '9')
    expect(screen.getByRole('alert').textContent).toBe('Not permitted: feature:pin')
    expect(field().value).toBe('3')
  })

  it('restores it and says so when the server never answers, leaving no rejection unhandled', async () => {
    const { user } = setup(2, () => Promise.reject(new TypeError('Failed to fetch')))
    await retype(user, '9')
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(field().value).toBe('3')
  })

  it('takes the new subject’s pin from a re-render while the box is not focused', () => {
    const { view } = setup(2)
    view.rerender(
      <PinField
        featureId={FEATURE_1}
        pin={kept}
        pinSprint={null}
        planId={PLAN_A}
        sprintLengthDays={PLAN.sprintLengthDays}
        startDate={PLAN.startDate}
        timezone={PLAN.timezone}
      />,
    )
    expect(field().value).toBe('')
    expect(described()).toBe(PIN_HINT)
  })

  it('reverts to the stored pin on Escape and sends nothing', async () => {
    const { onPin, user } = setup(2)
    await user.clear(field())
    await user.type(field(), '9{Escape}')
    expect(onPin).not.toHaveBeenCalled()
    expect(field().value).toBe('3')
  })

  it('commits on Enter without waiting for the box to be left', async () => {
    const { onPin, user } = setup(null)
    await user.type(field(), '2{Enter}')
    expect(onPin).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 1)
  })
})

// The plan fixture's own calendar, and a Monday. Ten-day sprints as well, because the boundary case
// that catches an exclusive read is a sprint whose last working day is a Friday two weeks on.
const ATLAS_SPRINT = PLAN.sprintLengthDays

const ATLAS = { startDate: '2026-09-28', sprintLengthDays: ATLAS_SPRINT, timezone: 'Europe/Belgrade' }

const TEN = { startDate: '2026-09-21', sprintLengthDays: 10, timezone: 'UTC' }

describe('showing a pin as the dates it means rather than as a bare index', () => {
  it('says the rule and no dates for an empty box, there being nothing to date', () => {
    expect(pinHint('', ATLAS)).toBe(PIN_HINT)
    expect(pinHint('   ', ATLAS)).toBe(PIN_HINT)
  })

  it('says the rule for text it would refuse, rather than dating a number it will not send', () => {
    expect(pinHint('abc', ATLAS)).toBe(PIN_HINT)
    expect(pinHint('0', ATLAS)).toBe(PIN_HINT)
    expect(pinHint('500', ATLAS)).toBe(PIN_HINT)
  })

  // The inclusive end, checked against `sprints.test.ts`'s own case rather than against the note: ten
  // working days from Monday 2026-09-21 end on Friday 2026-10-02, the Friday of the week after. An
  // exclusive read would print 2026-10-05, the Monday after, and every pin would look a day long.
  it('names the sprint’s last working day and not the first day after it', () => {
    expect(pinHint('1', TEN)).toContain('2026-09-21 to 2026-10-02')
    expect(pinHint('1', TEN)).toContain('both days included')
    expect(pinHint('1', TEN)).not.toContain('2026-10-05')
  })

  it('gives a one-day sprint the same date at both ends, which no exclusive range could', () => {
    const one = { startDate: '2026-09-21', sprintLengthDays: 1, timezone: 'UTC' }
    expect(pinHint('4', one)).toContain('2026-09-24 to 2026-09-24')
  })

  it('labels the sprint the way the box is counted, so the sentence and the number agree', () => {
    expect(pinHint('3', TEN)).toMatch(/^Sprint 3 runs/)
    expect(pinHint('1', TEN)).toMatch(/^Sprint 1 runs/)
  })

  it('moves the dates with the sprint, so the line is derived and not a fixed sentence', () => {
    expect(pinHint('1', ATLAS)).not.toBe(pinHint('2', ATLAS))
    expect(pinHint('3', ATLAS)).toContain('2026-11-05 to 2026-11-24')
  })

  // The zone is on `PlanCalendar` and read by `todayIn` alone, per `calendar.ts`. Asserted rather than
  // trusted, because the prop that carries it through the pin field would otherwise be unexplained.
  it('answers the same dates whatever zone the plan names, the conversion being UTC throughout', () => {
    const kolkata = { ...TEN, timezone: 'Asia/Kolkata' }
    expect(pinHint('2', kolkata)).toBe(pinHint('2', TEN))
  })

  it('says a pin only delays, both with dates and without, that being the whole of what one does', () => {
    expect(PIN_HINT).toContain('never move it earlier')
    expect(pinHint('2', TEN)).toContain('never moves one earlier')
  })
})
