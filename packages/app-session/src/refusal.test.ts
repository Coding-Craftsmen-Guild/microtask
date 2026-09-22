import { describe, expect, it } from 'vitest'
import { plainRefusal, type RefusalCopy } from './refusal'

const COPY: RefusalCopy = {
  unauthorised: 'u',
  forbidden: 'f',
  missing: 'm',
  conflict: 'c',
  tooLarge: 't',
  invalid: 'i',
  busy: 'b',
  broken: 'x',
}

describe('plainRefusal picks the sentence by status alone, never by what the API said', () => {
  it.each([
    [401, 'u'],
    [403, 'f'],
    [404, 'm'],
    [408, 'b'],
    [409, 'c'],
    [413, 't'],
    [429, 'b'],
    [400, 'i'],
    [422, 'i'],
    [418, 'i'],
    [500, 'x'],
    [502, 'x'],
    [0, 'x'],
  ])('answers %i with %s', (status, expected) => {
    expect(plainRefusal(status, COPY)).toBe(expected)
  })
})
