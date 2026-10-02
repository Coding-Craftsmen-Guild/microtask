import type { Plan } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  LABEL_1,
  unplacedPlan,
} from '../testing/plan-fixture'
import { detailsOf, DETAIL_WORDS, joinDetail, splitDetail, type Detail } from './detail-lines'

const detailFor = (plan: Plan, id: string): Detail => {
  const text = detailsOf(planScreenModel(plan)).get(id)
  if (text === undefined) throw new Error(`no detail for ${id}`)
  return splitDetail(text)
}

const factOf = (detail: Detail, label: string): string | null =>
  detail.facts.find((fact) => fact.label === label)?.value ?? null

const EMPTY: Detail = { context: '', title: '', dates: '', colour: '', facts: [] }

describe('joinDetail and splitDetail', () => {
  it('round-trips the four head lines and the facts under them', () => {
    const detail: Detail = {
      context: 'Phase 1 · Platform',
      title: 'Auth rewrite',
      dates: '2026-09-28 to 2026-10-02',
      colour: '#7c3aed',
      facts: [
        { label: DETAIL_WORDS.estimate, value: '5d' },
        { label: DETAIL_WORDS.sprint, value: 'S1' },
      ],
    }
    expect(splitDetail(joinDetail(detail))).toEqual(detail)
  })

  it('round-trips a head with no facts under it', () => {
    const detail: Detail = { ...EMPTY, title: 'Billing' }
    expect(splitDetail(joinDetail(detail))).toEqual(detail)
  })

  it('answers nothing at all for an empty string, which is what a mark with no detail carries', () => {
    expect(splitDetail('')).toEqual(EMPTY)
  })

  // The head is four lines by position, so a value holding a newline would push the dates into the
  // colour and the colour into the first fact — a card confidently naming the wrong everything.
  it('folds a separator inside a value, so one odd name cannot shift every line after it', () => {
    const odd = `Auth${String.fromCharCode(9)}rewrite${String.fromCharCode(10)}v2`
    const back = splitDetail(
      joinDetail({ ...EMPTY, title: odd, facts: [{ label: 'Rail', value: odd }] }),
    )
    expect(back.title).toBe('Auth rewrite v2')
    expect(back.facts).toEqual([{ label: 'Rail', value: 'Auth rewrite v2' }])
    expect(back.dates).toBe('')
  })
})

describe('detailsOf, for a feature', () => {
  it('titles the card with the feature name', () => {
    expect(detailFor(atlasPlan(), FEATURE_1).title).toBe('Auth rewrite')
  })

  it('says where it sits in one line: its group, then its rail', () => {
    expect(detailFor(atlasPlan(), FEATURE_1).context).toBe('Phase 1 · Platform')
  })

  it('names the rail alone for a feature in no group, rather than wording an absence', () => {
    expect(detailFor(atlasPlan(), FEATURE_2).context).toBe('Platform')
  })

  // The dot beside the context is the hue the mark itself is drawn in, which is `hueOf`'s rule: a
  // group's colour where there is one, and the rail's where there is not.
  it('carries its group’s hue, or its rail’s where it is in no group', () => {
    expect(detailFor(atlasPlan(), FEATURE_1).colour).toBe('#7c3aed')
    expect(detailFor(atlasPlan(), FEATURE_2).colour).toBe('#3b82f6')
  })

  it('words the estimate exactly as the table cell does', () => {
    expect(factOf(detailFor(atlasPlan(), FEATURE_1), DETAIL_WORDS.estimate)).toBe('5d')
  })

  it('words the sprint exactly as the table cell does', () => {
    expect(factOf(detailFor(atlasPlan(), FEATURE_1), DETAIL_WORDS.sprint)).toBe('S1')
  })

  it('answers the real calendar days the span covers, the last one inclusive', () => {
    expect(detailFor(atlasPlan(), FEATURE_1).dates).toBe('2026-09-28 to 2026-10-02')
  })

  it('answers no dates for a feature with no span, because there are none', () => {
    expect(detailFor(unplacedPlan('no-estimate'), FEATURE_2).dates).toBe('')
  })

  it('still says why an unplaced feature has no sprint', () => {
    expect(factOf(detailFor(unplacedPlan('no-estimate'), FEATURE_2), DETAIL_WORDS.sprint)).toBe(
      'not placed · no estimate',
    )
  })

  // Counted and not named: a card is 300px wide and four dependency names is a paragraph. The names
  // are in the table's own column and in the drawer, which is where somebody acting on them is going.
  it('counts what it waits on rather than naming them', () => {
    expect(factOf(detailFor(atlasPlan(), FEATURE_2), DETAIL_WORDS.waits)).toBe('1 feature')
  })

  it('says so in a word for a feature that waits on nothing', () => {
    expect(factOf(detailFor(atlasPlan(), FEATURE_1), DETAIL_WORDS.waits)).toBe(DETAIL_WORDS.nothing)
  })

  it('offers exactly three facts, a fourth making the strip a table again', () => {
    expect(detailFor(atlasPlan(), FEATURE_1).facts).toHaveLength(3)
  })
})

describe('detailsOf, for an item', () => {
  it('titles the card with the item name and names the feature it is under', () => {
    const detail = detailFor(atlasPlan(), ITEM_1)
    expect(detail.title).toBe('Sessions')
    expect(detail.context).toBe(`${DETAIL_WORDS.itemOf} Auth rewrite`)
  })

  // The one thing an item bar's place in a row does not say: bars are laid out back to back, so the
  // third of four and the third of ten look identical.
  it('says where it sits among its feature’s items, counted from one', () => {
    expect(factOf(detailFor(atlasPlan(), ITEM_1), DETAIL_WORDS.position)).toBe('1 of 2')
  })

  it('carries no waits-for fact, because a dependency belongs to a feature', () => {
    expect(factOf(detailFor(atlasPlan(), ITEM_1), DETAIL_WORDS.waits)).toBeNull()
  })

  it('answers its own dates and not its feature’s', () => {
    expect(detailFor(atlasPlan(), ITEM_1).dates).toBe('2026-09-28 to 2026-09-30')
  })
})

describe('detailsOf, over the whole plan', () => {
  it('answers one entry per feature and per item, and none for a rail', () => {
    const details = detailsOf(planScreenModel(atlasPlan()))
    expect([...details.keys()].sort()).toEqual(
      [FEATURE_1, FEATURE_2, ITEM_1, '01MPHHHHHHHHHHHHHHHHHHHHH2', '01MPHHHHHHHHHHHHHHHHHHHHH3'].sort(),
    )
    expect(details.has(EPIC_1)).toBe(false)
    expect(details.has(LABEL_1)).toBe(false)
  })
})
