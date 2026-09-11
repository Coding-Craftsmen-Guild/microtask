import { describe, expect, it } from 'vitest'
import { ACTION_REFUSALS, DOCUMENT_REFUSALS, plainRefusal, type RefusalCopy } from './refusal'

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

const SURFACES = [
  ['admin actions', ACTION_REFUSALS.admin],
  ['link actions', ACTION_REFUSALS.link],
  ['admin document saves', DOCUMENT_REFUSALS.admin],
  ['link document saves', DOCUMENT_REFUSALS.link],
] as const

describe('plainRefusal picks the sentence by status alone, never by what the API said', () => {
  it.each([
    [401, 'u'],
    [403, 'f'],
    [404, 'm'],
    [409, 'c'],
    [413, 't'],
    [400, 'i'],
    [422, 'i'],
    [405, 'i'],
    [408, 'b'],
    [429, 'b'],
    [500, 'x'],
    [502, 'x'],
    [503, 'x'],
    [0, 'x'],
  ])('answers a %i with its own sentence', (status, sentence) => {
    expect(plainRefusal(status, COPY)).toBe(sentence)
  })
})

describe('the copy each surface shows', () => {
  it.each(SURFACES)('names no API action, code or status on %s', (_surface, copy) => {
    for (const sentence of Object.values(copy)) {
      expect(sentence).not.toMatch(/Not permitted|[a-z]+:[a-z]+|\b[1-5]\d\d\b|_/)
      expect(sentence.length).toBeGreaterThan(0)
    }
  })

  it('tells a link visitor whose link was downgraded what legacy did: the link is read-only', () => {
    expect(DOCUMENT_REFUSALS.link.forbidden).toMatch(/^This link is read-only now/)
  })

  it('tells a link visitor whose link was revoked that the link is gone, not what the API calls its bearer', () => {
    expect(DOCUMENT_REFUSALS.link.unauthorised).toMatch(/^This share link is no longer available/)
    expect(ACTION_REFUSALS.link.unauthorised).toMatch(/^This share link is no longer available/)
  })

  it('tells an admin whose session lapsed to sign in again and then retry, since nothing retries on its own', () => {
    expect(DOCUMENT_REFUSALS.admin.unauthorised).toMatch(/Sign in again in another browser tab, then choose Try again\.$/)
  })

  it('tells a link visitor refused an action that its access may have changed, and an admin that it is not allowed', () => {
    expect(ACTION_REFUSALS.link.forbidden).toMatch(/^This link does not allow that/)
    expect(ACTION_REFUSALS.admin.forbidden).toBe('You are not allowed to make that change.')
  })

  it('offers the way out of a too-large tab, which the user can shorten before retrying', () => {
    expect(DOCUMENT_REFUSALS.admin.tooLarge).toMatch(/Shorten it, then choose Try again\.$/)
    expect(DOCUMENT_REFUSALS.link.tooLarge).toBe(DOCUMENT_REFUSALS.admin.tooLarge)
  })
})
