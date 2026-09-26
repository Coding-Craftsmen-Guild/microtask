import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_1, LABEL_1, LABEL_2, PLAN_A, atlasPlan } from '../testing/plan-fixture'
import { GROUP_FIELD_WORDS, GroupField } from './group-field'
import { joinGroups, splitGroups } from './group-options'

const OPTIONS = joinGroups(atlasPlan().labels)

const setLabel = vi.fn()

const show = (over: { labelId?: string | null; options?: string } = {}) =>
  render(
    <GroupField
      featureId={FEATURE_1}
      labelId={over.labelId ?? null}
      options={over.options ?? OPTIONS}
      planId={PLAN_A}
      setLabel={setLabel}
    />,
  )

const box = (): HTMLSelectElement => screen.getByLabelText('Group') as HTMLSelectElement

beforeEach(() => {
  setLabel.mockReset()
  setLabel.mockResolvedValue({ ok: true, value: atlasPlan() })
})

describe('the joined option list, which is the only shape a client boundary admits', () => {
  it('survives a round trip, so what the picker shows is what the server named', () => {
    expect(splitGroups(joinGroups(atlasPlan().labels))).toEqual(
      atlasPlan().labels.map((label) => ({ id: label.id, name: label.name })),
    )
  })

  it('splits on the first space only, a group name being free to hold spaces and an id not', () => {
    expect(splitGroups(`${LABEL_1} Phase one of three`)).toEqual([
      { id: LABEL_1, name: 'Phase one of three' },
    ])
  })

  it('answers nothing for an empty string, which is a plan with no groups rather than one blank group', () => {
    expect(splitGroups('')).toEqual([])
  })
})

describe('the field that puts one feature in a group', () => {
  it('offers every group of the plan plus the one option that is not a group', () => {
    show()

    expect([...box().options].map((one) => one.value)).toEqual(['', LABEL_1, LABEL_2])
    expect([...box().options].map((one) => one.textContent)).toEqual([
      GROUP_FIELD_WORDS.none,
      'Phase 1',
      'Phase 2',
    ])
  })

  it('opens on the group the feature is stored in, read back from the plan and not remembered', () => {
    show({ labelId: LABEL_2 })

    expect(box().value).toBe(LABEL_2)
  })

  it('sends the chosen group on change, there being no half-typed state to commit on blur', async () => {
    show()
    await userEvent.selectOptions(box(), LABEL_1)

    expect(setLabel).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_1, LABEL_1)
  })

  it('sends null rather than an empty string when a feature is taken out of its group', async () => {
    show({ labelId: LABEL_1 })
    await userEvent.selectOptions(box(), '')

    expect(setLabel).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_1, null)
  })

  it('says the API’s own sentence when a write is refused, and keeps the field on screen', async () => {
    setLabel.mockResolvedValue({ ok: false, status: 403, detail: 'That seat may not group work.' })
    show()
    await userEvent.selectOptions(box(), LABEL_1)

    expect(screen.getByRole('alert').textContent).toBe('That seat may not group work.')
    expect(box().getAttribute('aria-invalid')).toBe('true')
  })

  /**
   * A plan with no groups draws the box anyway, and that is the decision worth a case of its own: hiding
   * it would leave an admin who has never made a group with nothing on screen to explain why a feature
   * cannot be grouped, and the hint is where they are told the groups panel is.
   */
  it('draws a disabled box and says where groups are made, for a plan that has none', () => {
    show({ options: '' })

    expect(box().disabled).toBe(true)
    expect(screen.getByText(GROUP_FIELD_WORDS.empty)).toBeTruthy()
  })
})
