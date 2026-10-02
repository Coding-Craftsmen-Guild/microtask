import { describe, expect, it } from 'vitest'
import {
  closedHref,
  joinTabs,
  openedHref,
  splitTabs,
  stackedHref,
  tabHref,
  tabStack,
  type TabRef,
} from './tab-stack'

const ROOT = '/plans/atlas'

const feature = (id: string): TabRef => ({ id, kind: 'feature' })

const item = (id: string): TabRef => ({ id, kind: 'item' })

describe('the stack as it rides in the URL', () => {
  it('writes a letter and an id per tab, in the order they are drawn', () => {
    expect(joinTabs([feature('F1'), item('I2')])).toBe('f:F1,i:I2')
  })

  it('reads them back the same way, which is what makes the URL editable', () => {
    expect(splitTabs('f:F1,i:I2')).toEqual([feature('F1'), item('I2')])
  })

  it('answers nothing for a parameter that is not there at all', () => {
    expect(splitTabs(undefined)).toEqual([])
    expect(splitTabs('')).toEqual([])
  })

  // A URL is typed by people and outlives deploys, so the rest of the stack is still what somebody
  // meant even where one entry is not readable.
  it('skips an entry with no letter, an unknown letter or no id, and keeps the rest', () => {
    expect(splitTabs('f:F1,x:X1,F2,i:,i:I2')).toEqual([feature('F1'), item('I2')])
  })
})

describe('the whole stack, which is the parameter plus the route', () => {
  it('appends the subject the route names where the parameter has not got it', () => {
    expect(tabStack('f:F1', item('I2'))).toEqual([feature('F1'), item('I2')])
  })

  it('leaves it where it is where the parameter has, so switching tabs reorders nothing', () => {
    expect(tabStack('f:F1,i:I2,f:F3', item('I2'))).toEqual([
      feature('F1'),
      item('I2'),
      feature('F3'),
    ])
  })

  it('is the route alone for a drawer opened with no stack at all', () => {
    expect(tabStack(undefined, feature('F1'))).toEqual([feature('F1')])
  })

  it('never holds the same subject twice, however the parameter was written', () => {
    expect(tabStack('f:F1,f:F1', feature('F1'))).toEqual([feature('F1')])
  })
})

describe('where a tab goes when it is clicked', () => {
  it('is its own route, carrying the stack it is part of', () => {
    const stack = [feature('F1'), item('I2')]
    expect(tabHref(ROOT, item('I2'), stack)).toBe(`${ROOT}/i/I2?open=f:F1,i:I2`)
  })

  it('encodes an id that would otherwise escape its segment', () => {
    expect(tabHref(ROOT, feature('../elsewhere'), [])).toBe(`${ROOT}/f/..%2Felsewhere?open=`)
  })
})

describe('where closing one goes', () => {
  const stack = [feature('F1'), item('I2'), feature('F3')]

  // Closing the active tab opens the one beside it rather than closing the panel, which is what a tab
  // strip means everywhere else.
  it('opens the tab after the one that closed, with that one gone from the stack', () => {
    expect(closedHref(ROOT, item('I2'), stack, item('I2'))).toBe(`${ROOT}/f/F3?open=f:F1,f:F3`)
  })

  // Closing a tab nobody was reading leaves the panel where it is.
  it('stays on the active tab when another one closes', () => {
    expect(closedHref(ROOT, feature('F1'), stack, item('I2'))).toBe(`${ROOT}/i/I2?open=i:I2,f:F3`)
  })

  it('opens the one before where the last tab closed, there being nothing after it', () => {
    expect(closedHref(ROOT, feature('F3'), stack, feature('F3'))).toBe(`${ROOT}/i/I2?open=f:F1,i:I2`)
  })

  it('closes the panel when the last tab in the stack closes', () => {
    expect(closedHref(ROOT, feature('F1'), [feature('F1')], feature('F1'))).toBe(ROOT)
  })
})

describe('where a click on the board goes', () => {
  it('opens the subject and keeps what was already open', () => {
    expect(openedHref(ROOT, item('I2'), [feature('F1')])).toBe(`${ROOT}/i/I2?open=f:F1,i:I2`)
  })

  // Clicking the mark of something already open means "show me that one", not "open it twice".
  it('selects the tab a subject is already in rather than adding a second', () => {
    const stack = [feature('F1'), item('I2')]
    expect(openedHref(ROOT, feature('F1'), stack)).toBe(`${ROOT}/f/F1?open=f:F1,i:I2`)
  })

  it('opens the first one from an empty board', () => {
    expect(openedHref(ROOT, feature('F1'), [])).toBe(`${ROOT}/f/F1?open=f:F1`)
  })
})

// The board is drawn by a layout, and a layout cannot read the query, so the links on two thousand marks
// are built without the stack and the click is where it is put back.
describe('the address a click on the board turns into', () => {
  it('adds the stack to the route a mark already links to', () => {
    expect(stackedHref(`${ROOT}/f/F3`, 'f:F1,i:I2')).toBe(`${ROOT}/f/F3?open=f:F1,i:I2,f:F3`)
  })

  it('opens the first tab from a board with nothing open', () => {
    expect(stackedHref(`${ROOT}/i/I2`, null)).toBe(`${ROOT}/i/I2?open=i:I2`)
  })

  it('reads an id that was encoded into its segment', () => {
    expect(stackedHref(`${ROOT}/f/..%2Felsewhere`, null)).toBe(
      `${ROOT}/f/..%2Felsewhere?open=f:../elsewhere`,
    )
  })

  // A rail, a group and a make-one form are not tabs: opening one closes the stack rather than joining
  // it, which is what leaving the address alone does.
  it('leaves an address that is not a tab’s exactly as it was', () => {
    expect(stackedHref(`${ROOT}/r/EP1`, 'f:F1')).toBe(`${ROOT}/r/EP1`)
    expect(stackedHref(`${ROOT}/new/rail?n=2`, 'f:F1')).toBe(`${ROOT}/new/rail?n=2`)
  })
})
