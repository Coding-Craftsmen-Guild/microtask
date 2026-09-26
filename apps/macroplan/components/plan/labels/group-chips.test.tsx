import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FEATURE_1, FEATURE_2, LABEL_1, LABEL_2, atlasPlan } from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { PlanTable } from '../table/plan-table'
import { GROUP_RADIO_NAME, groupRadioId, groupCss, ALL_RADIO_ID, DIMMED_OPACITY } from './group-css'
import { GROUP_WORDS, GroupChips } from './group-chips'
import { labelRows } from './label-rows'

const ROWS = labelRows(planScreenModel(atlasPlan()))

const radios = (): readonly HTMLInputElement[] => [
  ...document.querySelectorAll<HTMLInputElement>(`input[name="${GROUP_RADIO_NAME}"]`),
]

const styleText = (): string => document.querySelector('style')?.textContent ?? ''

describe('the chips that select one group across every rail', () => {
  it('draws one radio per group plus the one that clears the choice, and opens on that one', () => {
    render(<GroupChips rows={ROWS} />)

    expect(radios().map((one) => one.id)).toEqual([
      ALL_RADIO_ID,
      groupRadioId(LABEL_1),
      groupRadioId(LABEL_2),
    ])
    expect(radios().filter((one) => one.defaultChecked).map((one) => one.id)).toEqual([ALL_RADIO_ID])
  })

  it('names each group and says how much is in it, an empty one included', () => {
    render(<GroupChips rows={ROWS} />)

    expect(screen.getByText('Phase 1 · 1 feature')).toBeTruthy()
    expect(screen.getByText(`Phase 2 · ${GROUP_WORDS.none}`)).toBeTruthy()
  })

  it('keeps every radio a label of its own chip, so a click on the words checks it', () => {
    render(<GroupChips rows={ROWS} />)

    for (const one of radios()) {
      const chip = document.querySelector(`label[for="${one.id}"]`)
      expect({ id: one.id, labelled: chip !== null }).toEqual({ id: one.id, labelled: true })
      expect(chip?.previousElementSibling).toBe(one)
    }
  })

  it('draws nothing at all for a plan with no groups, rather than a lone All chip', () => {
    const { container } = render(<GroupChips rows={[]} />)

    expect(container.firstChild).toBeNull()
  })

  it('says features in the plural only past one, a group of one being the common new group', () => {
    const one = [{ id: LABEL_1, name: 'Phase 1', colour: '#7c3aed', features: 1 }]
    const two = [{ id: LABEL_2, name: 'Phase 2', colour: '#0088cc', features: 2 }]
    render(
      <>
        <GroupChips rows={one} />
        <GroupChips rows={two} />
      </>,
    )

    expect(screen.getByText('Phase 1 · 1 feature')).toBeTruthy()
    expect(screen.getByText('Phase 2 · 2 features')).toBeTruthy()
  })
})

describe('the rule that dims what is not in the chosen group', () => {
  it('writes one rule per group and none for the All chip, which is why nothing dims by default', () => {
    const css = groupCss(ROWS)

    expect(css.split('}').filter((part) => part !== '')).toHaveLength(ROWS.length)
    expect(css).not.toContain(ALL_RADIO_ID)
  })

  it('selects the bars and rows of every other group from the plan root, by :has on the radio', () => {
    const css = groupCss(ROWS)

    expect(css).toContain(
      `[data-slot="plan-root"]:has(#${groupRadioId(LABEL_1)}:checked) ` +
        `[data-label-id]:not([data-label-id="${LABEL_1}"]){opacity:${DIMMED_OPACITY}}`,
    )
  })

  it('skips an id that could not be a ULID, rather than escaping it into a selector', () => {
    const hostile = [{ id: 'a"]{}', name: 'Injected', colour: '#000000', features: 0 }]

    expect(groupCss(hostile)).toBe('')
  })

  /**
   * The mechanism end to end, and the one case that proves it is not vacuous.
   *
   * A rule naming an attribute nothing carries would pass every assertion above and dim nothing at all, so
   * this renders the **table** — the surface a screen reader reads — and requires the rows it names to be
   * exactly the rows the rule's `:not()` would leave lit. `FEATURE_1` is in `Phase 1` in the fixture and
   * `FEATURE_2` is in no group, so selecting `Phase 1` must leave one lit and dim the other.
   */
  it('marks the rows the rule matches, so the selector is not naming an attribute nothing carries', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    const lit = document.querySelectorAll(`[data-label-id="${LABEL_1}"]`)
    const dimmed = document.querySelectorAll(`[data-label-id]:not([data-label-id="${LABEL_1}"])`)

    expect([...lit].map((row) => row.getAttribute('data-testid'))).toContain(`row-${FEATURE_1}`)
    expect([...dimmed].map((row) => row.getAttribute('data-testid'))).not.toContain(
      `row-${FEATURE_1}`,
    )
    expect(document.querySelector(`[data-testid="row-${FEATURE_2}"]`)?.hasAttribute('data-label-id'))
      .toBe(false)
  })

  it('ships the rules inside the chips, so a plan with groups carries exactly one style element', () => {
    render(<GroupChips rows={ROWS} />)

    expect(document.querySelectorAll('style')).toHaveLength(1)
    expect(styleText()).toBe(groupCss(ROWS))
  })
})
