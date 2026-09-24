import { MAX_ESTIMATE_DAYS, MAX_ITEM_DESCRIPTION_BYTES } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import {
  budgetLine,
  descriptionBytes,
  estimateEntry,
  normalisedDescription,
  overBudget,
  pinCeiling,
  pinEntry,
  tooFarOut,
  OVER_BUDGET,
  TOO_MANY_DAYS,
  WHOLE_DAYS,
  WHOLE_SPRINTS,
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
      expect(days(typed), typed).toBe(WHOLE_DAYS)
    }
  })

  it('refuses the spellings Number() would have accepted, which no user typed on purpose', () => {
    expect(typeof days('0x10')).toBe('string')
    expect(typeof days('1e3')).toBe('string')
    expect(typeof days('Infinity')).toBe('string')
  })

  it('refuses more days than the contract’s own maximum, naming it', () => {
    expect(days(String(MAX_ESTIMATE_DAYS))).toBe(MAX_ESTIMATE_DAYS)
    expect(days(String(MAX_ESTIMATE_DAYS + 1))).toBe(TOO_MANY_DAYS)
    expect(TOO_MANY_DAYS).toContain(String(MAX_ESTIMATE_DAYS))
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
    const cap = String(MAX_ITEM_DESCRIPTION_BYTES)
    expect(budgetLine(0)).toBe(`${cap} of ${cap} bytes left`)
    expect(budgetLine(MAX_ITEM_DESCRIPTION_BYTES)).toBe(`0 of ${cap} bytes left`)
    expect(budgetLine(MAX_ITEM_DESCRIPTION_BYTES + 12)).toBe(`12 bytes over the ${cap}-byte cap`)
  })

  it('refuses in terms of what the API would otherwise do, since it answers 200 either way', () => {
    expect(OVER_BUDGET).toContain(String(MAX_ITEM_DESCRIPTION_BYTES))
    expect(OVER_BUDGET).toContain('drops the rest without saying so')
  })
})

describe('the two normalisations the domain applies that a byte cap does not cover', () => {
  const chr = (code: number): string => String.fromCharCode(code)

  it('strips exactly the set cleanDescription strips: every C0 code but tab and newline, plus DEL', () => {
    for (let code = 0; code < 32; code += 1) {
      const kept = code === 9 || code === 10 ? chr(code) : ''
      const becomes = code === 13 ? '\n' : kept
      expect(normalisedDescription(`a${chr(code)}b`), String(code)).toBe(`a${becomes}b`)
    }
    expect(normalisedDescription(`a${chr(127)}b`)).toBe('ab')
  })

  it('keeps every printable character, including the ones a byte count cares about', () => {
    expect(normalisedDescription('Ship it 😀 é')).toBe('Ship it 😀 é')
    expect(normalisedDescription('')).toBe('')
  })

  // The order is the domain's, and it is load-bearing: `\r` is itself in the stripped set, so a
  // strip-first implementation would delete the lone `\r` the server turns into a newline.
  it('normalises CRLF and a lone CR to a newline rather than stripping them', () => {
    expect(normalisedDescription('one\r\ntwo')).toBe('one\ntwo')
    expect(normalisedDescription('one\rtwo')).toBe('one\ntwo')
    expect(normalisedDescription(`one${chr(13)}${chr(10)}two`)).toBe('one\ntwo')
  })
})

const ATLAS_SPRINT = 14

const pin = (typed: string, sprintLengthDays = ATLAS_SPRINT): number | null | string => {
  const entry = pinEntry(typed, sprintLengthDays)
  return entry.kind === 'pin' ? entry.sprint : entry.detail
}

describe('the two states a pin field can be in, and the off-by-one between them', () => {
  it('sends null for an empty field, which is the unpin and the only absence a pin has', () => {
    expect(pin('')).toBeNull()
    expect(pin('   ')).toBeNull()
  })

  // The whole point of the conversion: the table calls the plan's first sprint `S1` and the contract
  // stores it as 0. A field that sent what was typed would pin one sprint late, everywhere, silently.
  it('sends the sprint before the one that was typed, the box being counted from 1', () => {
    expect(pin('1')).toBe(0)
    expect(pin('3')).toBe(2)
    expect(pin(' 07 ')).toBe(6)
  })

  it('refuses a 0, there being no sprint 0 on a screen that counts from 1', () => {
    expect(pin('0')).toBe(WHOLE_SPRINTS)
    expect(pin('00')).toBe(WHOLE_SPRINTS)
  })

  it('refuses a fraction, a negative and a word with one sentence naming the rule', () => {
    for (const typed of ['2.5', '-3', 'abc', 'S3', '1e3', '0x10']) {
      expect(pin(typed), typed).toBe(WHOLE_SPRINTS)
    }
  })
})

// The contract has no upper bound at all — `SprintIndex` is `int().min(0)` and its own note argues
// for that — so every case below is about a bound this field owns and the API does not.
describe('the ceiling this field owns because the contract does not have one', () => {
  it('is the sprints MAX_ESTIMATE_DAYS spans in this plan’s own sprint length', () => {
    expect(pinCeiling(ATLAS_SPRINT)).toBe(Math.ceil(MAX_ESTIMATE_DAYS / ATLAS_SPRINT))
    expect(pinCeiling(ATLAS_SPRINT)).toBe(72)
    expect(pinCeiling(1)).toBe(MAX_ESTIMATE_DAYS)
    expect(pinCeiling(10)).toBe(100)
  })

  it('accepts the ceiling itself and refuses the sprint after it', () => {
    expect(pin(String(pinCeiling(ATLAS_SPRINT)))).toBe(pinCeiling(ATLAS_SPRINT) - 1)
    expect(pin(String(pinCeiling(ATLAS_SPRINT) + 1))).toBe(tooFarOut(ATLAS_SPRINT))
  })

  // The typo the plan named: `500` where `50` was meant. The API accepts it, so the field must not.
  it('refuses the 500 a contract with no maximum would have stored', () => {
    expect(pin('500')).toBe(tooFarOut(ATLAS_SPRINT))
    expect(typeof pin('50')).toBe('number')
  })

  it('moves with the plan’s sprint length rather than being a round number', () => {
    expect(pin('120', 14)).toBe(tooFarOut(14))
    expect(pin('120', 1)).toBe(119)
  })

  it('names the ceiling and the estimate cap it comes from, so the refusal is checkable', () => {
    expect(tooFarOut(ATLAS_SPRINT)).toContain('72')
    expect(tooFarOut(ATLAS_SPRINT)).toContain(String(MAX_ESTIMATE_DAYS))
  })
})
