import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FEATURE_1, FEATURE_2, LABEL_1, LABEL_2, atlasPlan } from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { PlanTable } from '../table/plan-table'
import { GROUP_RADIO_NAME, groupRadioId, groupCss, ALL_RADIO_ID, DIMMED_OPACITY } from './group-css'
import { GroupChips } from './group-chips'
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

  it('names each group and counts what is in it, an empty one in a single word', () => {
    render(<GroupChips rows={ROWS} />)

    // The words themselves, not `GROUP_WORDS.none` interpolated. An empty group first read
    // "nothing in it yet", which is a sentence in a control strip and wrapped the chip row onto a
    // second line; it is now "empty". A test that interpolates the constant asserts only that the
    // chip uses its own constant, so it passed unchanged through that rewording and would pass
    // through the next one — including a reword to nothing at all.
    expect(screen.getByText('Phase 1 · 1 feature')).toBeTruthy()
    expect(screen.getByText('Phase 2 · empty')).toBeTruthy()
  })

  it('names the chip that clears the choice, so the way back out of a group is a word and not a gesture', () => {
    render(<GroupChips rows={ROWS} />)

    expect(document.querySelector(`label[for="${ALL_RADIO_ID}"]`)?.textContent).toBe('All work')
  })

  it('keeps every radio a label of its own chip, so a click on the words checks it', () => {
    render(<GroupChips rows={ROWS} />)

    for (const one of radios()) {
      const chip = document.querySelector(`label[for="${one.id}"]`)
      expect({ id: one.id, labelled: chip !== null }).toEqual({ id: one.id, labelled: true })
      expect(chip?.previousElementSibling).toBe(one)
    }
  })

  /**
   * The chosen chip and the focused chip are the whole of the feedback this control gives, and the
   * browser draws both — there is no state and no JavaScript to fall back on. So the radio must stay
   * `sr-only` (offscreen but focusable) rather than hidden, and the chip beside it must keep a
   * `peer-checked:` and a `peer-focus-visible:` variant.
   *
   * Variant prefixes and not colours: the palette was just restyled — a `ring` became an `outline`,
   * and the resting text went muted — and pinning `ring-2` would have failed that restyle while
   * saying nothing about whether a chosen chip still looks chosen.
   */
  it('leaves chosen and focused to the browser, which needs the radio sr-only and the chip its peer', () => {
    render(<GroupChips rows={ROWS} />)

    // So the loop below cannot pass by finding nothing: one radio per group, plus the clearing one.
    expect(radios()).toHaveLength(ROWS.length + 1)
    for (const one of radios()) {
      const classes = one.className.split(' ')
      const chip = document.querySelector(`label[for="${one.id}"]`)?.getAttribute('class') ?? ''
      expect({ id: one.id, offscreen: classes.includes('sr-only'), peer: classes.includes('peer') })
        .toEqual({ id: one.id, offscreen: true, peer: true })
      expect(chip).toContain('peer-checked:')
      expect(chip).toContain('peer-focus-visible:')
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
