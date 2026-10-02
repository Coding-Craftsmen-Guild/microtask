import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_1, FEATURE_2, LABEL_1, LABEL_2, PLAN_A, atlasPlan } from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { PlanTable } from '../table/plan-table'
import { GROUP_RADIO_NAME, groupRadioId, groupCss, ALL_RADIO_ID, DIMMED_OPACITY } from './group-css'
import { PLAN_ROOT } from '../shell/shell-css'
import { GroupChips } from './group-chips'
import { labelRows } from './label-rows'
import { allWorkFit, groupFits } from './group-fit'

const ROWS = labelRows(planScreenModel(atlasPlan()))

const ALL_FIT = allWorkFit(planScreenModel(atlasPlan()))

const radios = (): readonly HTMLInputElement[] => [
  ...document.querySelectorAll<HTMLInputElement>(`input[name="${GROUP_RADIO_NAME}"]`),
]

const styleText = (): string => document.querySelector('style')?.textContent ?? ''

const pushed: string[] = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => pushed.push(href) }),
}))

vi.mock('next/link', async () => ({ default: (await import('../testing/next-link')).LinkDouble }))

afterEach(() => {
  cleanup()
  pushed.length = 0
})

describe('the chips that select one group across every rail', () => {
  it('draws one radio per group plus the one that clears the choice, and opens on that one', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)

    expect(radios().map((one) => one.id)).toEqual([
      ALL_RADIO_ID,
      groupRadioId(LABEL_1),
      groupRadioId(LABEL_2),
    ])
    expect(radios().filter((one) => one.defaultChecked).map((one) => one.id)).toEqual([ALL_RADIO_ID])
  })

  it('names each group and counts what is in it, an empty one in a single word', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)

    // The words themselves, not `GROUP_WORDS.none` interpolated. An empty group first read
    // "nothing in it yet", which is a sentence in a control strip and wrapped the chip row onto a
    // second line; it is now "empty". A test that interpolates the constant asserts only that the
    // chip uses its own constant, so it passed unchanged through that rewording and would pass
    // through the next one — including a reword to nothing at all.
    //
    // The count is the bare number now, the word "features" six times across a filter row being the
    // same word six times. Zero stays a word, because "0" beside a name does not explain the blank
    // timeline that choosing it produces.
    expect(screen.getByText('Phase 1')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('Phase 2')).toBeTruthy()
    expect(screen.getByText('empty')).toBeTruthy()
  })

  it('keeps the sentence as the chip’s own name, so what is lost to the eye is not lost to a reader', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)

    const chips = [...document.querySelectorAll('[data-slot="group-chip"]')]
    expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Phase 1 · 1 feature',
      'Phase 2 · empty',
    ])
    expect(chips.map((chip) => chip.getAttribute('title'))).toEqual([
      'Phase 1 · 1 feature',
      'Phase 2 · empty',
    ])
  })

  /**
   * The hue reaches the chip **once**, as `--chip-hue`, and the tint, the ink and the chosen ring are
   * all mixed from it by classes Tailwind can see (`./chip-css.ts`).
   *
   * The property and not the computed colour, because a computed one is not there to read: a
   * `backgroundColor: 'color-mix(…)'` in the style object is correct in a browser and dropped outright
   * by `happy-dom`, which parses inline declarations and discards a value it cannot read. That was the
   * first shape of this and the reason it is not the shape now.
   */
  it('hands each chip its group’s hue once, and lets the classes mix the rest from it', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)

    const chip = document.querySelector('[data-slot="group-chip"]')
    expect(chip?.getAttribute('style')).toContain('#7c3aed')
    const classes = chip?.getAttribute('class') ?? ''
    expect(classes).toContain('var(--chip-hue)')
    expect(classes).toContain('color-mix')
  })

  it('names the chip that clears the choice, so the way back out of a group is a word and not a gesture', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)

    expect(document.querySelector(`label[for="${ALL_RADIO_ID}"]`)?.textContent).toBe('All work')
  })

  it('keeps every radio a label of its own chip, so a click on the words checks it', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)

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
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)

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
    const { container } = render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={[]} />)

    expect(container.firstChild).toBeNull()
  })

  it('says features in the plural only past one, a group of one being the common new group', () => {
    const one = [{ id: LABEL_1, name: 'Phase 1', colour: '#7c3aed', features: 1, fit: null }]
    const two = [{ id: LABEL_2, name: 'Phase 2', colour: '#0088cc', features: 2, fit: null }]
    render(
      <>
        <GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={one} />
        <GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={two} />
      </>,
    )

    expect(screen.getByText('Phase 1')).toBeTruthy()
    expect(screen.getByText('Phase 2')).toBeTruthy()
    const chips = [...document.querySelectorAll('[data-slot="group-chip"]')]
    expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Phase 1 · 1 feature',
      'Phase 2 · 2 features',
    ])
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

    expect(css).toContain(`${PLAN_ROOT}:has(#${groupRadioId(LABEL_1)}:checked) `)
    expect(css).toContain(`:not([data-label-id="${LABEL_1}"]) + text{opacity:${DIMMED_OPACITY}}`)
  })

  // The canvas draws text again — a point's name and an item's — and the names came back without this,
  // so choosing a group dimmed every mark and left every name on top of one at full brightness. A name
  // is the next sibling of its mark rather than a child of anything, because a wrapper per mark is an
  // element per mark on a canvas held to one per item, so the rule reaches it with `+ text`.
  it('dims the name beside a mark it dims, a bright label over a quiet point being the defect', () => {
    const css = groupCss(ROWS)
    const quieted = `:is([data-slot="feature-bar"],[data-slot="item-mark"]):not([data-label-id="${LABEL_1}"]) + text`

    expect(css).toContain(quieted)
    // Never the arcs or the table rows: neither has a `<text>` beside it, and a row's next sibling is
    // the next row — which the first half of the rule has already judged on its own group.
    expect(css).not.toContain('[data-slot="arc"]:not([data-label-id="${LABEL_1}"]) + text')
  })

  // The defect this replaced. The rule was `[data-label-id]:not([data-label-id="X"])`, and a feature in
  // **no** group renders no `data-label-id` at all — so it matched nothing, stayed at full opacity, and
  // choosing a group visibly changed nothing on a plan where most work is ungrouped, which is every new
  // plan. Selecting by slot is what makes "grey out the others" mean all of the others.
  it('dims a mark that is in no group at all, which selecting on the attribute alone never did', () => {
    const css = groupCss(ROWS)

    expect(css).toContain('[data-slot="feature-bar"]')
    expect(css).not.toContain(`[data-label-id]:not(`)
  })

  it('names every kind of mark a group reaches, a lit arc over a dimmed plan being worse than neither', () => {
    const css = groupCss(ROWS)

    for (const slot of ['feature-bar', 'item-mark', 'arc', 'plan-table-row']) {
      expect(css).toContain(`[data-slot="${slot}"]`)
    }
  })

  // There were five. `bar-label` was the fifth, and it did not come back with the names: a slot per
  // label is an element per mark, which is the budget the canvas is drawn under, so the name is reached
  // as the sibling of the mark instead.
  it('names no bar label, a name being reached through the mark beside it rather than a slot', () => {
    expect(groupCss(ROWS)).not.toContain('bar-label')
  })

  it('skips an id that could not be a ULID, rather than escaping it into a selector', () => {
    const hostile = [{ id: 'a"]{}', name: 'Injected', colour: '#000000', features: 0, fit: null }]

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

  // The other half of the same proof: the ungrouped row has to be reached by the rule that actually
  // ships, which selects on the slot. Asserting it against the rendered table is what stops the rule
  // from being a string nothing matches.
  it('reaches the ungrouped row by slot, so choosing a group really does dim it', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    const dimmed = document.querySelectorAll(
      `[data-slot="plan-table-row"]:not([data-label-id="${LABEL_1}"])`,
    )

    expect([...dimmed].map((row) => row.getAttribute('data-testid'))).toContain(`row-${FEATURE_2}`)
    expect([...dimmed].map((row) => row.getAttribute('data-testid'))).not.toContain(
      `row-${FEATURE_1}`,
    )
  })

  it('ships the rules inside the chips, so a plan with groups carries exactly one style element', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)

    expect(document.querySelectorAll('style')).toHaveLength(1)
    expect(styleText()).toBe(groupCss(ROWS))
  })
})

describe('the way into a group, and the way to make one', () => {
  it('opens a group’s own drawer on a double click, the chip’s single click being the selection', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd planId={PLAN_A} rows={ROWS} />)
    const chip = screen.getByText(/Phase 1/)

    fireEvent.doubleClick(chip)

    expect(pushed).toEqual([`/plans/${PLAN_A}/g/${LABEL_1}`])
  })

  it('leaves a single click alone, so choosing a group still costs one click and no navigation', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd planId={PLAN_A} rows={ROWS} />)

    fireEvent.click(screen.getByText(/Phase 1/))

    expect(pushed).toEqual([])
  })

  it('navigates nowhere for a double click that lands on no chip at all', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd planId={PLAN_A} rows={ROWS} />)

    fireEvent.doubleClick(screen.getByText('All work'))

    expect(pushed).toEqual([])
  })

  it('offers a new group at the end of the row, where the groups are and not up in the head', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd planId={PLAN_A} rows={ROWS} />)
    const pill = screen.getByRole('link', { name: '+ Group' })

    expect(pill.getAttribute('href')).toBe(`/plans/${PLAN_A}/new/group`)
    expect([...document.querySelectorAll('[data-slot]')].at(-1)).toBe(pill)
  })

  it('offers it to a viewer who may make one and to nobody else', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={PLAN_A} rows={ROWS} />)

    expect(screen.queryByRole('link', { name: '+ Group' })).toBeNull()
  })

  // The seat surface has no group drawer and no way to make one — `SEAT_DRAWER_ROUTES` addresses
  // features and items and nothing else — so it passes no plan id, and the chips stay what they are
  // there: a way of looking at the plan, with nothing to open and nothing to add.
  it('stays a plain selector where no plan id is passed, which is the seat surface', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd planId={null} rows={ROWS} />)

    fireEvent.doubleClick(screen.getByText(/Phase 1/))

    expect(pushed).toEqual([])
    expect(screen.queryByRole('link', { name: '+ Group' })).toBeNull()
  })

  it('still draws nothing at all for a plan with no groups, pill included', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd planId={PLAN_A} rows={[]} />)

    expect(document.querySelector('[data-slot="group-chips"]')).toBeNull()
    expect(screen.queryByRole('link', { name: '+ Group' })).toBeNull()
  })
})

// Where the view goes when a chip is chosen is decided on the server and written onto the chip, for
// the reason `data-detail` and `data-hover-id` are: the root that reads it is a client component, and
// a map of groups is not one of the four things it may be handed (`../module-boundaries.test.tsx`).
describe('what a chip carries about where the view should go', () => {
  const chipFor = (labelId: string): Element | null =>
    document.querySelector(`[data-slot="group-chip"][data-label-id="${labelId}"]`)

  it('names the stop and the first day for a group with work placed in it', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)
    const fit = groupFits(planScreenModel(atlasPlan())).get(LABEL_1)
    expect(chipFor(LABEL_1)?.getAttribute('data-fit-rung')).toBe(fit?.rung)
    expect(chipFor(LABEL_1)?.getAttribute('data-fit-day')).toBe(String(fit?.day))
  })

  it('carries neither on a group with nothing placed, so clicking it selects and moves nothing', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)
    expect(groupFits(planScreenModel(atlasPlan())).get(LABEL_2)).toBeUndefined()
    expect(chipFor(LABEL_2)?.getAttribute('data-fit-rung')).toBeNull()
    expect(chipFor(LABEL_2)?.getAttribute('data-fit-day')).toBeNull()
  })

  it('sends All work back to the plan’s own opening fit, at day zero', () => {
    render(<GroupChips allFit={ALL_FIT} mayAdd={false} planId={null} rows={ROWS} />)
    const all = document.querySelector(`label[for="${ALL_RADIO_ID}"]`)
    expect(all?.getAttribute('data-fit-rung')).toBe(ALL_FIT.rung)
    expect(all?.getAttribute('data-fit-day')).toBe('0')
  })
})
