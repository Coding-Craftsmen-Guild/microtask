import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_1, LABEL_1, LABEL_2, PLAN_A, atlasPlan } from '../testing/plan-fixture'
import { GROUP_FIELD_WORDS, GroupField } from './group-field'
import { joinPicks } from './pick-list'

const OPTIONS = joinPicks(atlasPlan().labels)

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

const chips = (): readonly HTMLInputElement[] => screen.getAllByRole<HTMLInputElement>('radio')

const chip = (name: string): HTMLInputElement => screen.getByRole<HTMLInputElement>('radio', { name })

beforeEach(() => {
  setLabel.mockReset()
  setLabel.mockResolvedValue({ ok: true, value: atlasPlan() })
})

describe('the chips that put one feature in a group', () => {
  it('offers every group of the plan plus the one chip that is not a group', () => {
    show()

    expect(chips().map((one) => one.value)).toEqual(['', LABEL_1, LABEL_2])
    expect(chips().map((one) => one.labels?.[0]?.textContent)).toEqual([
      GROUP_FIELD_WORDS.none,
      'Phase 1',
      'Phase 2',
    ])
  })

  // One name for the set and one choice in it, which is what a radio group means and what a row of
  // buttons could not say. The legend is the name.
  it('is one set of radios rather than four unrelated controls', () => {
    show()

    expect(screen.getByRole('group', { name: GROUP_FIELD_WORDS.label })).toBeTruthy()
    expect(chips().every((one) => one.name === chips()[0]?.name)).toBe(true)
  })

  it('opens on the group the feature is stored in, read back from the plan and not remembered', () => {
    show({ labelId: LABEL_2 })

    expect(chip('Phase 2').checked).toBe(true)
    expect(chip('Phase 1').checked).toBe(false)
  })

  it('checks the no-group chip for a feature in none, so the set always has an answer', () => {
    show()

    expect(chip(GROUP_FIELD_WORDS.none).checked).toBe(true)
  })

  it('sends the chosen group at once, there being no half-typed state to commit on blur', async () => {
    show()
    await userEvent.click(chip('Phase 1'))

    expect(setLabel).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_1, LABEL_1)
  })

  it('sends null rather than an empty string when a feature is taken out of its group', async () => {
    show({ labelId: LABEL_1 })
    await userEvent.click(chip(GROUP_FIELD_WORDS.none))

    expect(setLabel).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_1, null)
  })

  // The hue is the whole reason these are chips rather than an option list: the canvas paints a grouped
  // feature in its group's colour, so the chip and the bar have to agree on sight.
  it('paints each chip’s dot in its own group’s hue, which is what the board paints that feature in', () => {
    show({ labelId: LABEL_1 })
    const dots = [...document.querySelectorAll('[data-slot="group-chip"] span')]

    expect(dots.map((dot) => dot.getAttribute('style'))).toContain('background-color: #7c3aed;')
    expect(dots.map((dot) => dot.getAttribute('style'))).toContain('background-color: #0088cc;')
  })

  it('borders the chosen chip in that hue too, so the choice is not carried by a tint alone', () => {
    show({ labelId: LABEL_1 })

    expect(chip('Phase 1').closest('label')?.getAttribute('style')).toBe('border-color: #7c3aed;')
    expect(chip('Phase 2').closest('label')?.getAttribute('style')).toBeNull()
  })

  it('says the API’s own sentence when a write is refused, and keeps the chips on screen', async () => {
    setLabel.mockResolvedValue({ ok: false, status: 403, detail: 'That seat may not group work.' })
    show()
    await userEvent.click(chip('Phase 1'))

    expect(screen.getByRole('alert').textContent).toBe('That seat may not group work.')
    expect(chips()).toHaveLength(3)
  })

  it('draws no chips at all and says where groups are made, for a plan that has none', () => {
    show({ options: '' })

    expect(screen.queryAllByRole('radio')).toEqual([])
    expect(screen.getByText(GROUP_FIELD_WORDS.empty)).toBeTruthy()
  })
})
