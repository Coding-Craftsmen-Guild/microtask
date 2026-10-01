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

const valueOf = (detail: Detail, label: string): string | null =>
  detail.lines.find((line) => line.label === label)?.value ?? null

describe('joinDetail and splitDetail', () => {
  it('round-trips a title and its lines', () => {
    const detail: Detail = {
      title: 'Auth rewrite',
      lines: [
        { label: 'Rail', value: 'Platform' },
        { label: 'Estimate', value: '5d' },
      ],
    }
    expect(splitDetail(joinDetail(detail))).toEqual(detail)
  })

  it('answers a title and no lines for a detail that has none', () => {
    expect(splitDetail(joinDetail({ title: 'Billing', lines: [] }))).toEqual({
      title: 'Billing',
      lines: [],
    })
  })

  it('answers nothing at all for an empty string, which is what a mark with no detail carries', () => {
    expect(splitDetail('')).toEqual({ title: '', lines: [] })
  })

  it('folds a separator inside a value, so one odd name cannot shift every line after it', () => {
    const odd = `Auth${String.fromCharCode(9)}rewrite${String.fromCharCode(10)}v2`
    const back = splitDetail(joinDetail({ title: odd, lines: [{ label: 'Rail', value: odd }] }))
    expect(back).toEqual({
      title: 'Auth rewrite v2',
      lines: [{ label: 'Rail', value: 'Auth rewrite v2' }],
    })
  })
})

describe('detailsOf, for a feature', () => {
  it('titles the card with the feature name', () => {
    expect(detailFor(atlasPlan(), FEATURE_1).title).toBe('Auth rewrite')
  })

  it('names its rail', () => {
    expect(valueOf(detailFor(atlasPlan(), FEATURE_1), DETAIL_WORDS.rail)).toBe('Platform')
  })

  it('names its group', () => {
    expect(valueOf(detailFor(atlasPlan(), FEATURE_1), DETAIL_WORDS.group)).toBe('Phase 1')
  })

  it('leaves the group line out for a feature in no group, rather than wording an absence', () => {
    expect(valueOf(detailFor(atlasPlan(), FEATURE_2), DETAIL_WORDS.group)).toBeNull()
  })

  it('words the estimate exactly as the table cell does', () => {
    expect(valueOf(detailFor(atlasPlan(), FEATURE_1), DETAIL_WORDS.estimate)).toBe(
      '5d',
    )
  })

  it('words the sprint exactly as the table cell does', () => {
    expect(valueOf(detailFor(atlasPlan(), FEATURE_1), DETAIL_WORDS.sprint)).toBe('S1')
  })

  it('answers the real calendar days the span covers, the last one inclusive', () => {
    expect(valueOf(detailFor(atlasPlan(), FEATURE_1), DETAIL_WORDS.dates)).toBe(
      '2026-09-28 to 2026-10-02',
    )
  })

  it('leaves the dates out for a feature with no span, because there are none', () => {
    expect(valueOf(detailFor(unplacedPlan('no-estimate'), FEATURE_2), DETAIL_WORDS.dates)).toBeNull()
  })

  it('still says why an unplaced feature has no sprint', () => {
    expect(valueOf(detailFor(unplacedPlan('no-estimate'), FEATURE_2), DETAIL_WORDS.sprint)).toBe(
      'not placed · no estimate',
    )
  })

  it('names what it waits on', () => {
    expect(valueOf(detailFor(atlasPlan(), FEATURE_2), DETAIL_WORDS.blocked)).toBe('Auth rewrite')
  })

  it('leaves the blocked line out for a feature that waits on nothing', () => {
    expect(valueOf(detailFor(atlasPlan(), FEATURE_1), DETAIL_WORDS.blocked)).toBeNull()
  })
})

describe('detailsOf, for an item', () => {
  it('titles the card with the item name and names the feature it is under', () => {
    const detail = detailFor(atlasPlan(), ITEM_1)
    expect(detail.title).toBe('Sessions')
    expect(valueOf(detail, DETAIL_WORDS.feature)).toBe('Auth rewrite')
  })

  it('names the rail its feature is on', () => {
    expect(valueOf(detailFor(atlasPlan(), ITEM_1), DETAIL_WORDS.rail)).toBe('Platform')
  })

  it('carries no blocked line, because a dependency belongs to a feature', () => {
    expect(valueOf(detailFor(atlasPlan(), ITEM_1), DETAIL_WORDS.blocked)).toBeNull()
  })

  it('answers its own dates and not its feature’s', () => {
    expect(valueOf(detailFor(atlasPlan(), ITEM_1), DETAIL_WORDS.dates)).toBe(
      '2026-09-28 to 2026-09-30',
    )
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
