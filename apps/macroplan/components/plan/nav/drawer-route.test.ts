import { describe, expect, it } from 'vitest'
import { selectionOf } from './drawer-route'

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
