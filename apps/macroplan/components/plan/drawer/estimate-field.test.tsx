import { NO_ANSWER } from '@repo/app-session/no-answer'
import type { Plan } from '@repo/api-client'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { atlasPlan, FEATURE_1, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { ESTIMATE_HINT, WHOLE_DAYS } from './field'
import { EstimateField } from './estimate-field'

type Estimate = (
  planId: string,
  subjectId: string,
  days: number | null,
) => Promise<ActionResult<Plan>>

const sized = (days: number | null): ActionResult<Plan> => ({
  ok: true,
  value: atlasPlan({
    features: atlasPlan().features.map((one) =>
      one.id === FEATURE_1 ? { ...one, estimateDays: days } : one,
    ),
  }),
})

const kept: Estimate = (_planId, _subjectId, days) => Promise.resolve(sized(days))

const field = (name = 'Estimate in days') =>
  screen.getByRole<HTMLInputElement>('textbox', { name })

const described = (control: HTMLElement): string =>
  (control.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((one) => one !== '')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' | ')

const setup = (estimateDays: number | null = 5, estimate: Estimate = kept) => {
  const onEstimate = vi.fn(estimate)
  const view = render(
    <EstimateField
      estimate={onEstimate}
      estimateDays={estimateDays}
      kind="feature"
      planId={PLAN_A}
      subjectId={FEATURE_1}
    />,
  )
  return { onEstimate, view, user: userEvent.setup() }
}

const retype = async (user: ReturnType<typeof userEvent.setup>, typed: string) => {
  await user.clear(field())
  if (typed !== '') await user.type(field(), typed)
  await user.tab()
}

describe('the three states an estimate can be left in', () => {
  it('shows a stored estimate as a bare number of days', () => {
    setup(40)
    expect(field().value).toBe('40')
  })

  it('shows nothing at all for an estimate nobody has authored', () => {
    setup(null)
    expect(field().value).toBe('')
  })

  it('shows a milestone as 0, which is a value on screen and not an empty box', () => {
    setup(0)
    expect(field().value).toBe('0')
  })

  it('sends the number for days', async () => {
    const { onEstimate, user } = setup(5)
    await retype(user, '12')
    expect(onEstimate).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 12)
  })

  it('sends null when the field is emptied, which is the clear and not a no-op', async () => {
    const { onEstimate, user } = setup(5)
    await retype(user, '')
    expect(onEstimate).toHaveBeenCalledWith(PLAN_A, FEATURE_1, null)
  })

  it('sends null for a milestone emptied, so 0 → empty is a real change', async () => {
    const { onEstimate, user } = setup(0)
    await retype(user, '')
    expect(onEstimate).toHaveBeenCalledTimes(1)
    expect(onEstimate).toHaveBeenCalledWith(PLAN_A, FEATURE_1, null)
  })

  it('sends 0 for a milestone entered where nothing was sized, so empty → 0 is one too', async () => {
    const { onEstimate, user } = setup(null)
    await retype(user, '0')
    expect(onEstimate).toHaveBeenCalledTimes(1)
    expect(onEstimate).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 0)
  })

  it('sends nothing when an empty field is left empty', async () => {
    const { onEstimate, user } = setup(null)
    await retype(user, '')
    expect(onEstimate).not.toHaveBeenCalled()
  })

  it('sends nothing when a milestone is left at 0, spellings included', async () => {
    const { onEstimate, user } = setup(0)
    await retype(user, '0')
    expect(onEstimate).not.toHaveBeenCalled()
    await retype(user, ' 00 ')
    expect(onEstimate).not.toHaveBeenCalled()
  })
})

describe('what the field refuses itself, rather than letting the API answer 422', () => {
  it('refuses a fraction and sends nothing, keeping what was typed so it can be fixed', async () => {
    const { onEstimate, user } = setup(5)
    await retype(user, '2.5')
    expect(onEstimate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(WHOLE_DAYS)
    expect(field().value).toBe('2.5')
  })

  it('refuses a negative, which the contract’s min(0) would have answered as a generic 422', async () => {
    const { onEstimate, user } = setup(5)
    await retype(user, '-3')
    expect(onEstimate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  // The case `type="number"` cannot see: a number input empties its own value when it cannot parse
  // it, so this field would read `''` and send the clear — deleting a real estimate over a typo.
  it('refuses text that is not a number at all, rather than reading it as a clear', async () => {
    const { onEstimate, user } = setup(5)
    await retype(user, 'soon')
    expect(onEstimate).not.toHaveBeenCalled()
    expect(field().value).toBe('soon')
  })

  it('refuses more days than the contract’s maximum, naming the limit', async () => {
    const { onEstimate, user } = setup(5)
    await retype(user, '1001')
    expect(onEstimate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('1000')
  })

  it('clears its own refusal once the value is fixed', async () => {
    const { onEstimate, user } = setup(5)
    await retype(user, '2.5')
    await retype(user, '3')
    expect(onEstimate).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 3)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says days are whole and 0 is a milestone before anything is refused', () => {
    setup(5)
    expect(screen.getByText(/0 is a milestone that takes no time/)).toBeTruthy()
  })
})

describe('what is on screen once the server has answered', () => {
  it('shows the estimate the answered plan holds, not the number that was sent', async () => {
    const { user } = setup(5, () => Promise.resolve(sized(9)))
    await retype(user, '12')
    expect(field().value).toBe('9')
  })

  it('shows an empty field when the answered plan holds no estimate for it', async () => {
    const { user } = setup(5, () => Promise.resolve(sized(null)))
    await retype(user, '0')
    expect(field().value).toBe('')
  })

  it('shows 0 when the answered plan holds a milestone, rather than falling back to the old value', async () => {
    const { user } = setup(5, () => Promise.resolve(sized(0)))
    await retype(user, '0')
    expect(field().value).toBe('0')
  })

  it('restores the stored estimate and says why when the server refuses the write', async () => {
    const { user } = setup(5, () =>
      Promise.resolve({ ok: false, status: 403, detail: 'Not permitted: feature:estimate' }),
    )
    await retype(user, '12')
    expect(screen.getByRole('alert').textContent).toBe('Not permitted: feature:estimate')
    expect(field().value).toBe('5')
  })

  it('restores it and says so when the server never answers, leaving no rejection unhandled', async () => {
    const { user } = setup(5, () => Promise.reject(new TypeError('Failed to fetch')))
    await retype(user, '12')
    expect((await screen.findByRole('alert')).textContent).toBe(NO_ANSWER.detail)
    expect(field().value).toBe('5')
  })

  it('reads the answer back for an item out of the items array', async () => {
    const onEstimate = vi.fn<Estimate>(() =>
      Promise.resolve({
        ok: true,
        value: atlasPlan({
          items: atlasPlan().items.map((one) =>
            one.id === ITEM_1 ? { ...one, estimateDays: 4 } : one,
          ),
        }),
      }),
    )
    render(
      <EstimateField
        estimate={onEstimate}
        estimateDays={3}
        kind="item"
        planId={PLAN_A}
        subjectId={ITEM_1}
      />,
    )
    const user = userEvent.setup()
    await retype(user, '6')
    expect(onEstimate).toHaveBeenCalledWith(PLAN_A, ITEM_1, 6)
    expect(field().value).toBe('4')
  })

  it('takes the new subject’s estimate from a re-render while the field is not focused', () => {
    const { view } = setup(5)
    view.rerender(
      <EstimateField
        estimate={kept}
        estimateDays={null}
        kind="feature"
        planId={PLAN_A}
        subjectId={FEATURE_1}
      />,
    )
    expect(field().value).toBe('')
  })
})

describe('what a reader is told about the rule and about a refusal', () => {
  it('describes the field by its hint while nothing is refused', () => {
    setup(5)
    expect(described(field())).toBe(ESTIMATE_HINT)
    expect(field().getAttribute('aria-invalid')).toBeNull()
  })

  it('describes it by the hint and then the refusal, which is reading order', async () => {
    const { user } = setup(5)
    await retype(user, '2.5')
    expect(described(field())).toBe(`${ESTIMATE_HINT} | ${WHOLE_DAYS}`)
    expect(field().getAttribute('aria-invalid')).toBe('true')
  })

  it('goes back to the hint alone once the value is fixed', async () => {
    const { user } = setup(5)
    await retype(user, '2.5')
    await retype(user, '3')
    expect(field().getAttribute('aria-invalid')).toBeNull()
    expect(described(field())).toContain('0 is a milestone')
  })
})
