import { describe, expect, it } from 'vitest'
import { addressOf, answeredSelection, selectionOf } from './drawer-route'

const ADMIN = '/plans/01MPAAAAAAAAAAAAAAAAAAAAA1'

const SEAT = '/s/a_plan_seats_token1'

const at = (root: string, rest: string, query = '') => selectionOf(root, `${root}${rest}`, new URLSearchParams(query))

describe('selectionOf reads which drawer an address opens', () => {
  it('opens nothing at the plan itself', () => {
    expect(at(ADMIN, '')).toBeNull()
  })

  it('opens a feature or an item, carrying the open tabs with it', () => {
    expect(at(ADMIN, '/f/F1', 'open=f:F1,i:I2')).toEqual({ kind: 'feature', id: 'F1', open: 'f:F1,i:I2' })
    expect(at(ADMIN, '/i/I2')).toEqual({ kind: 'item', id: 'I2', open: null })
  })

  it('opens a rail, a group, and the two add drawers', () => {
    expect(at(ADMIN, '/r/E1')).toEqual({ kind: 'rail', id: 'E1' })
    expect(at(ADMIN, '/g/L1')).toEqual({ kind: 'group', id: 'L1' })
    expect(at(ADMIN, '/new/rail', 'n=4')).toEqual({ kind: 'new-rail', count: 4 })
    expect(at(ADMIN, '/new/group')).toEqual({ kind: 'new-group' })
  })

  it('counts a missing or unreadable rail count as none', () => {
    expect(at(ADMIN, '/new/rail', 'n=x')).toEqual({ kind: 'new-rail', count: 0 })
  })

  it('decodes an id the address encoded', () => {
    expect(at(ADMIN, '/f/a%20b')).toEqual({ kind: 'feature', id: 'a b', open: null })
  })

  it('opens a feature or an item on a seat, under its token', () => {
    expect(at(SEAT, '/i/I2')).toEqual({ kind: 'item', id: 'I2', open: null })
  })

  it('opens nothing for an address outside the plan, or one it does not know', () => {
    expect(selectionOf(ADMIN, '/plans/OTHER/f/F1', new URLSearchParams())).toBeNull()
    expect(at(ADMIN, '/x/F1')).toBeNull()
    expect(at(ADMIN, '/f/')).toBeNull()
    expect(at(ADMIN, '/f/F1/extra')).toBeNull()
  })
})

// A drawer opened on something drawn a moment ago names its placeholder, which the store reads as the real
// id once the create has been answered (`../store/plan-store.ts`).
describe('answeredSelection reads what a selection names through the store', () => {
  const real = (id: string): string => ({ 'pending:1': 'REAL_1', 'pending:2': 'REAL_2' })[id] ?? id

  it('hands back the very selection when nothing it names has been answered', () => {
    const selection = at(ADMIN, '/f/F1', 'open=f:F1,i:I2')
    expect(answeredSelection(selection, real)).toBe(selection)
    expect(answeredSelection(null, real)).toBeNull()
  })

  it('reads the subject and every open tab through it', () => {
    const selection = at(ADMIN, '/i/pending%3A1', 'open=f:F1,i:pending:1')
    expect(answeredSelection(selection, real)).toEqual({ kind: 'item', id: 'REAL_1', open: 'f:F1,i:REAL_1' })
  })

  it('reads a rail or a group through it, and leaves the two add drawers as they are', () => {
    expect(answeredSelection(at(ADMIN, '/r/pending%3A2'), real)).toEqual({ kind: 'rail', id: 'REAL_2' })
    expect(answeredSelection(at(ADMIN, '/g/pending%3A1'), real)).toEqual({ kind: 'group', id: 'REAL_1' })
    const adding = at(ADMIN, '/new/rail', 'n=2')
    expect(answeredSelection(adding, real)).toBe(adding)
  })
})

describe('addressOf is where a selection is opened, which selectionOf reads back', () => {
  it('round-trips every drawer that names something', () => {
    const named: readonly (readonly [string, string])[] = [
      ['/f/F1', 'open=f:F1,i:I2'],
      ['/i/I2', ''],
      ['/r/E1', ''],
      ['/g/L1', ''],
    ]
    for (const [rest, query] of named) {
      const selection = at(ADMIN, rest, query)
      if (selection === null || !('id' in selection)) throw new Error(`${rest} names nothing`)
      const [path = '', search = ''] = addressOf(ADMIN, selection).split('?')
      expect(selectionOf(ADMIN, path, new URLSearchParams(search))).toEqual(selection)
    }
  })

  it('encodes the id, as every route builder does', () => {
    expect(addressOf(SEAT, { kind: 'item', id: 'a/b', open: null })).toBe(`${SEAT}/i/a%2Fb`)
  })
})
