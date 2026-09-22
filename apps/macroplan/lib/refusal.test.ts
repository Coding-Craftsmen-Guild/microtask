import { describe, expect, it } from 'vitest'
import { ACTION_REFUSALS, plainRefusal } from './refusal'

describe('the sentences this surface shows', () => {
  it.each(Object.entries(ACTION_REFUSALS))('says something for %s', (_field, sentence) => {
    expect(sentence.length).toBeGreaterThan(10)
  })

  it('names this product and never the other one', () => {
    const all = Object.values(ACTION_REFUSALS).join(' ')
    expect(all).toContain('Macroplan')
    expect(all).not.toContain('Microtask')
  })

  it('names no internal action, which is what the API own detail would have done', () => {
    for (const sentence of Object.values(ACTION_REFUSALS)) expect(sentence).not.toMatch(/\b\w+:\w+\b/)
  })
})

describe('plainRefusal picks by status alone', () => {
  it.each([
    [401, ACTION_REFUSALS.unauthorised],
    [403, ACTION_REFUSALS.forbidden],
    [404, ACTION_REFUSALS.missing],
    [409, ACTION_REFUSALS.conflict],
    [413, ACTION_REFUSALS.tooLarge],
    [422, ACTION_REFUSALS.invalid],
    [429, ACTION_REFUSALS.busy],
    [500, ACTION_REFUSALS.broken],
  ])('answers %i with this surface own sentence', (status, expected) => {
    expect(plainRefusal(status, ACTION_REFUSALS)).toBe(expected)
  })
})
