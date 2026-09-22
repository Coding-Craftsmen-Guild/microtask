import { describe, expect, it, vi } from 'vitest'
import { flattened, missingIsNotFound, rejected, type ActionResult } from './action-result'

const NOT_FOUND = new Error('NEXT_NOT_FOUND')

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw NOT_FOUND
  },
}))

describe('rejected', () => {
  it('spells an app’s own refusal the way the API’s are spelled', () => {
    expect(rejected(409, 'Someone else changed this.')).toEqual({
      ok: false,
      status: 409,
      detail: 'Someone else changed this.',
    })
  })
})

describe('missingIsNotFound', () => {
  it.each([404, 422])('renders the route’s not-found page for a %i', (status) => {
    expect(() => missingIsNotFound(rejected(status, 'gone'))).toThrow(NOT_FOUND)
  })

  it.each([403, 409, 413, 500, 0])('lets a %i through as a sentence the page can show', (status) => {
    expect(missingIsNotFound(rejected(status, 'said so'))).toEqual(rejected(status, 'said so'))
  })

  it('lets a success through untouched', () => {
    const ok: ActionResult<string> = { ok: true, value: 'stored' }
    expect(missingIsNotFound(ok)).toBe(ok)
  })
})

describe('flattened', () => {
  it('unwraps a nested success', () => {
    expect(flattened({ ok: true, value: { ok: true, value: 7 } })).toEqual({ ok: true, value: 7 })
  })

  it('unwraps a refusal the inner call decided', () => {
    const inner = rejected(403, 'not allowed')
    expect(flattened({ ok: true, value: inner })).toBe(inner)
  })

  it('passes an outer refusal straight through', () => {
    const outer = rejected(0, 'no answer')
    expect(flattened<number>(outer)).toBe(outer)
  })
})
