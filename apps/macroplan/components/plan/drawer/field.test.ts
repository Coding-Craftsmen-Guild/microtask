import { MAX_ESTIMATE_DAYS, MAX_ITEM_DESCRIPTION_BYTES } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import {
  budgetLine,
  descriptionBytes,
  estimateEntry,
  overBudget,
  OVER_BUDGET,
} from './field'

const days = (typed: string): number | null | string => {
  const entry = estimateEntry(typed)
  return entry.kind === 'days' ? entry.days : entry.detail
}

describe('the three states an estimate field can be in', () => {
  it('sends null for an empty field, which is “nobody has sized this”', () => {
    expect(days('')).toBeNull()
    expect(days('   ')).toBeNull()
  })

  it('sends 0 for a zero, which is a milestone and not an absence', () => {
    expect(days('0')).toBe(0)
  })

  it('sends the number for a number of days', () => {
    expect(days('40')).toBe(40)
    expect(days(' 7 ')).toBe(7)
    expect(days('007')).toBe(7)
  })

  it('tells 0 and empty apart, which is the whole reason this function exists', () => {
    expect(days('0')).not.toBeNull()
    expect(days('')).not.toBe(0)
  })

  it('refuses a fraction, a negative and a word with one sentence naming the field’s own rule', () => {
    for (const typed of ['2.5', '-3', 'abc', '5d', '-0']) {
      expect(days(typed), typed).toBe(
        'An estimate is a whole number of days, 0 or more — or empty for work nobody has sized yet.',
      )
    }
  })

  it('refuses the spellings Number() would have accepted, which no user typed on purpose', () => {
    expect(typeof days('0x10')).toBe('string')
    expect(typeof days('1e3')).toBe('string')
    expect(typeof days('Infinity')).toBe('string')
  })

  it('refuses more days than the contract’s own maximum, naming it', () => {
    expect(days(String(MAX_ESTIMATE_DAYS))).toBe(MAX_ESTIMATE_DAYS)
    expect(days(String(MAX_ESTIMATE_DAYS + 1))).toBe(
      `An estimate cannot be more than ${String(MAX_ESTIMATE_DAYS)} days.`,
    )
  })
})

describe('counting a description in the unit the cap is written in', () => {
  it('counts UTF-8 bytes and not UTF-16 units, which disagree on anything but ASCII', () => {
    expect(descriptionBytes('abc')).toBe(3)
    expect(descriptionBytes('é')).toBe(2)
    expect('é'.length).toBe(1)
    expect(descriptionBytes('😀')).toBe(4)
    expect('😀'.length).toBe(2)
  })

  // The failure mode this field exists to prevent, demonstrated rather than described: 2,049 emoji
  // are 8,196 bytes and so truncated by the domain, while `.length` reads 4,098 — half the budget —
  // and would have sent them. A char count can only ever under-report, so it always errs this way.
  it('catches a string a length check would have waved through to be silently truncated', () => {
    const emoji = '😀'.repeat(2_049)
    expect(overBudget(descriptionBytes(emoji))).toBe(true)
    expect(emoji.length).toBeLessThan(MAX_ITEM_DESCRIPTION_BYTES)
  })

  it('allows a description that fills the budget exactly, multi-byte characters included', () => {
    const exact = '😀'.repeat(MAX_ITEM_DESCRIPTION_BYTES / 4)
    expect(descriptionBytes(exact)).toBe(MAX_ITEM_DESCRIPTION_BYTES)
    expect(overBudget(descriptionBytes(exact))).toBe(false)
    expect(overBudget(descriptionBytes(`${exact}a`))).toBe(true)
  })

  it('says what is left before the cap is reached, and by how much once it is passed', () => {
    expect(budgetLine(0)).toBe(`${String(MAX_ITEM_DESCRIPTION_BYTES)} of 8192 bytes left`)
    expect(budgetLine(MAX_ITEM_DESCRIPTION_BYTES)).toBe('0 of 8192 bytes left')
    expect(budgetLine(MAX_ITEM_DESCRIPTION_BYTES + 12)).toBe('12 bytes over the 8192-byte cap')
  })

  it('refuses in terms of what the API would otherwise do, since it answers 200 either way', () => {
    expect(OVER_BUDGET).toContain('8192')
    expect(OVER_BUDGET).toContain('drops the rest without saying so')
  })
})
