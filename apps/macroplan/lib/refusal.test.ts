import { describe, expect, it } from 'vitest'
import { ACTION_REFUSALS, plainRefusal } from './refusal'

const SURFACES = [
  ['admin actions', ACTION_REFUSALS.admin],
  ['link actions', ACTION_REFUSALS.link],
] as const

describe('the sentences each surface shows', () => {
  it.each(SURFACES)('says something for every field of %s', (_surface, copy) => {
    for (const sentence of Object.values(copy)) expect(sentence.length).toBeGreaterThan(10)
  })

  it.each(SURFACES)('names this product and never the other one on %s', (_surface, copy) => {
    const all = Object.values(copy).join(' ')
    expect(all).not.toContain('Microtask')
  })

  it('names this product somewhere, so the copy is this app own and not a shared default', () => {
    expect(Object.values(ACTION_REFUSALS.admin).join(' ')).toContain('Macroplan')
    expect(Object.values(ACTION_REFUSALS.link).join(' ')).toContain('Macroplan')
  })

  it.each(SURFACES)('names no API action, code, status or underscore on %s', (_surface, copy) => {
    for (const sentence of Object.values(copy)) {
      expect(sentence).not.toMatch(/Not permitted|[a-z]+:[a-z]+|\b[1-5]\d\d\b|_/)
      expect(sentence.length).toBeGreaterThan(0)
    }
  })

  it('has exactly two surfaces, one per principal kind, so neither can be forgotten', () => {
    expect(Object.keys(ACTION_REFUSALS).sort()).toEqual(['admin', 'link'])
  })
})

describe('the two surfaces differ where, and only where, the audience differs', () => {
  it('tells a plan seat whose link was revoked that the link is gone, never to sign in', () => {
    expect(ACTION_REFUSALS.link.unauthorised).toBe('This share link is no longer available.')
    expect(ACTION_REFUSALS.link.unauthorised).not.toMatch(/sign in|signed in/i)
  })

  it('tells a plan seat refused an action that its access may have changed, and to reload', () => {
    expect(ACTION_REFUSALS.link.forbidden).toMatch(/^This link does not allow that/)
    expect(ACTION_REFUSALS.link.forbidden).toMatch(/reload the page/)
  })

  it('tells an admin instead that this browser is not signed in, and that it is not allowed', () => {
    expect(ACTION_REFUSALS.admin.unauthorised).toBe('This browser is not signed in as the admin.')
    expect(ACTION_REFUSALS.admin.forbidden).toBe('You are not allowed to make that change.')
  })

  it('shares every other sentence, because nothing else about a 404 or a 409 is per audience', () => {
    for (const field of ['missing', 'conflict', 'tooLarge', 'invalid', 'busy', 'broken'] as const) {
      expect(ACTION_REFUSALS.link[field]).toBe(ACTION_REFUSALS.admin[field])
    }
  })
})

describe('plainRefusal picks by status alone', () => {
  it.each([
    [401, 'unauthorised'],
    [403, 'forbidden'],
    [404, 'missing'],
    [409, 'conflict'],
    [413, 'tooLarge'],
    [422, 'invalid'],
    [429, 'busy'],
    [500, 'broken'],
  ] as const)('answers %i with each surface own sentence for %s', (status, field) => {
    expect(plainRefusal(status, ACTION_REFUSALS.admin)).toBe(ACTION_REFUSALS.admin[field])
    expect(plainRefusal(status, ACTION_REFUSALS.link)).toBe(ACTION_REFUSALS.link[field])
  })
})
