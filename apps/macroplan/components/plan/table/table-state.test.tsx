import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ADMIN_DRAWER_ROUTES, featurePath, itemPath } from '../../../lib/drawer-routes'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  ITEM_3,
  LABEL_1,
  PLAN_A,
  railedPlan,
} from '../testing/plan-fixture'
import { colId } from './columns'
import { PlanTable, type TableWrites } from './plan-table'
import { ADD_ANCHOR, DELETE_ANCHOR } from './row-actions'
import { TABLE_CSS, TABLE_WORDS } from './table-css'

const EVERYTHING: TableWrites = { rename: true, add: true, remove: true }

const show = (over: { writes?: TableWrites; plan?: ReturnType<typeof atlasPlan> } = {}) =>
  render(
    <PlanTable
      newRailHref="/plans/p/new/rail?n=1"
      plan={planScreenModel(over.plan ?? atlasPlan())}
      root={PLAN_A}
      routes={ADMIN_DRAWER_ROUTES}
      writes={over.writes ?? EVERYTHING}
    />,
  )

const rows = (): readonly HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="plan-table-row"]')]

const visible = (): readonly string[] =>
  rows()
    .filter((row) => !row.hidden)
    .map((row) => row.getAttribute('data-testid') ?? '')

const order = (): readonly string[] => rows().map((row) => row.getAttribute('data-testid') ?? '')

const headOrder = (): readonly string[] =>
  [...document.querySelectorAll('thead th')].map((cell) => cell.getAttribute('data-col') ?? '')

const type = (value: string): void => {
  fireEvent.change(screen.getByLabelText(TABLE_WORDS.search), { target: { value } })
}

const pick = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

const clickHead = (column: string): void => {
  const head = document.querySelector(`[data-sort-col="${column}"]`)
  if (head === null) throw new Error(`no sort button for ${column}`)
  fireEvent.click(head)
}

const move = (column: string, by: '-1' | '1'): void => {
  const button = document.querySelector(`[data-col-key="${column}"][data-move="${by}"]`)
  if (button === null) throw new Error(`no move button for ${column}`)
  fireEvent.click(button)
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(cleanup)

describe('searching the table', () => {
  it('opens with every row showing, so a plan is whole until somebody narrows it', () => {
    show()
    expect(visible()).toEqual(order())
    expect(order().length).toBeGreaterThan(4)
  })

  it('keeps a feature and everything under it when the feature itself matched', () => {
    show()
    type('auth')
    expect(visible()).toEqual([`row-${FEATURE_1}`, `row-${ITEM_1}`, 'row-01MPHHHHHHHHHHHHHHHHHHHHH2'])
  })

  it('keeps a matching item under its own feature, so a result is never an orphan', () => {
    show()
    type('invoices')
    expect(visible()).toEqual([`row-${FEATURE_2}`, `row-${ITEM_3}`])
  })

  it('matches a group’s name as well as a rail’s, the search being for anything on the row', () => {
    show()
    type('phase 1')
    expect(visible()).toContain(`row-${FEATURE_1}`)
    expect(visible()).not.toContain(`row-${FEATURE_2}`)
  })

  it('ignores case and surrounding space, which is what somebody pasting a name gives it', () => {
    show()
    type('  AUTH  ')
    expect(visible()).toContain(`row-${FEATURE_1}`)
  })

  it('shows everything again when the box is cleared', () => {
    show()
    type('auth')
    type('')
    expect(visible()).toEqual(order())
  })

  it('hides a row rather than styling it, so it leaves the accessibility tree too', () => {
    show()
    type('auth')
    const gone = rows().find((row) => row.getAttribute('data-testid') === `row-${FEATURE_2}`)
    expect(gone?.hidden).toBe(true)
  })
})

describe('filtering the table', () => {
  it('keeps one rail and drops the others, blocks whole', () => {
    show({ plan: railedPlan() })
    const first = document.querySelector(`[data-rail="${EPIC_1}"]`)?.getAttribute('data-testid') ?? ''
    pick(TABLE_WORDS.allRails, EPIC_1)
    expect(visible()).toContain(first)
    for (const row of rows()) {
      if (row.getAttribute('data-rail') !== EPIC_1) expect(row.hidden).toBe(true)
    }
  })

  it('keeps one group, items included, because an item has no group of its own to ask about', () => {
    show()
    pick(TABLE_WORDS.allGroups, LABEL_1)
    expect(visible()).toEqual([`row-${FEATURE_1}`, `row-${ITEM_1}`, 'row-01MPHHHHHHHHHHHHHHHHHHHHH2'])
  })

  it('offers the ungrouped as a choice of its own, which no list of groups could express', () => {
    show()
    pick(TABLE_WORDS.allGroups, 'none')
    expect(visible()).toEqual([`row-${FEATURE_2}`, `row-${ITEM_3}`])
  })

  it('narrows by a search and a filter together rather than by whichever came last', () => {
    show()
    pick(TABLE_WORDS.allGroups, LABEL_1)
    type('sessions')
    expect(visible()).toEqual([`row-${FEATURE_1}`, `row-${ITEM_1}`])
  })

  // A deleted group's option leaves its select, which then reads as every group; the rows have to agree.
  it('lets go of a group the plan no longer holds, which its filter already shows as every group', () => {
    const { rerender } = show()
    pick(TABLE_WORDS.allGroups, LABEL_1)
    const stored = atlasPlan()
    const ungrouped = {
      ...stored,
      labels: stored.labels.filter((one) => one.id !== LABEL_1),
      features: stored.features.map((one) => (one.labelId === LABEL_1 ? { ...one, labelId: null } : one)),
    }
    rerender(
      <PlanTable
        newRailHref="/plans/p/new/rail?n=1"
        plan={planScreenModel(ungrouped)}
        root={PLAN_A}
        routes={ADMIN_DRAWER_ROUTES}
        writes={EVERYTHING}
      />,
    )
    expect(visible()).toHaveLength(rows().length)
  })
})

describe('ordering the table', () => {
  it('opens in the derived order the canvas draws, which is what rows.ts says must not be re-derived', () => {
    show()
    expect(order()).toEqual([
      `row-${FEATURE_1}`,
      `row-${ITEM_1}`,
      'row-01MPHHHHHHHHHHHHHHHHHHHHH2',
      `row-${FEATURE_2}`,
      `row-${ITEM_3}`,
    ])
  })

  it('moves a whole block, so an item is never separated from the feature it flows under', () => {
    show()
    clickHead('estimate')
    expect(order()).toEqual([
      `row-${FEATURE_2}`,
      `row-${ITEM_3}`,
      `row-${FEATURE_1}`,
      `row-${ITEM_1}`,
      'row-01MPHHHHHHHHHHHHHHHHHHHHH2',
    ])
  })

  it('reverses on a second click and returns to the derived order on a third', () => {
    show()
    clickHead('estimate')
    const ascending = order()
    clickHead('estimate')
    expect(order()).not.toEqual(ascending)
    clickHead('estimate')
    expect(order()).toEqual([
      `row-${FEATURE_1}`,
      `row-${ITEM_1}`,
      'row-01MPHHHHHHHHHHHHHHHHHHHHH2',
      `row-${FEATURE_2}`,
      `row-${ITEM_3}`,
    ])
  })

  it('says which column is sorted on the header itself, which is the attribute a reader is told by', () => {
    show()
    clickHead('feature')
    const head = document.querySelector('th[data-col="feature"]')
    expect(head?.getAttribute('aria-sort')).toBe('ascending')
    clickHead('feature')
    expect(head?.getAttribute('aria-sort')).toBe('descending')
    clickHead('feature')
    expect(head?.getAttribute('aria-sort')).toBeNull()
  })

  it('marks one column at a time, so two headers never both claim to be the sort', () => {
    show()
    clickHead('feature')
    clickHead('sprint')
    expect(document.querySelector('th[data-col="feature"]')?.getAttribute('aria-sort')).toBeNull()
    expect(document.querySelector('th[data-col="sprint"]')?.getAttribute('aria-sort')).toBe('ascending')
  })

  it('offers no sort on the two columns a block has several values of', () => {
    show()
    expect(document.querySelector('[data-sort-col="item"]')).toBeNull()
    expect(document.querySelector('[data-sort-col="progress"]')).toBeNull()
    expect(document.querySelector('[data-sort-col="epic"]')).not.toBeNull()
  })
})

describe('which columns are shown, and in what order', () => {
  // The checkbox is still the control, and still all a reader touches; what changed is how the sheet learns
  // it was unchecked. It asked the checkbox with `:has()`, anchored on a panel of two thousand rows, which
  // made mounting the table at the cap a style recalculation of every row against nine of them (ADR 0069).
  it('hides a column with a checkbox, which the table hears and states as one attribute its sheet keys on', () => {
    show()
    const sheets = [...document.querySelectorAll('style')].map((one) => one.textContent ?? '').join('')
    expect(sheets).toContain(TABLE_CSS)
    expect(TABLE_CSS).toContain('[data-hide~="group"] [data-col="group"]{display:none}')
    expect(TABLE_CSS).not.toContain(':has(')
    const root = document.querySelector('[data-slot="table-root"]')
    const box = document.querySelector(`#${colId('group')}`)
    if (!(box instanceof HTMLInputElement)) throw new Error('no checkbox for the group column')
    fireEvent.click(box)
    expect(root?.getAttribute('data-hide')?.split(' ')).toContain('group')
    fireEvent.click(box)
    expect(root?.getAttribute('data-hide') ?? '').not.toContain('group')
  })

  it('names every rendered column in the menu, and every menu row names a column that exists', () => {
    show()
    const offered = [...document.querySelectorAll('[data-slot="column-row"]')].map(
      (row) => row.querySelector('input')?.id ?? '',
    )
    expect(offered).toEqual(headOrder().map((key) => colId(key)))
  })

  it('moves a column left in the header and in every row at once', () => {
    show()
    expect(headOrder().slice(0, 2)).toEqual(['epic', 'feature'])
    move('feature', '-1')
    expect(headOrder().slice(0, 2)).toEqual(['feature', 'epic'])
    const first = rows()[0]
    expect([...(first?.children ?? [])].map((cell) => cell.getAttribute('data-col')).slice(0, 2)).toEqual([
      'feature',
      'epic',
    ])
  })

  it('moves it back again, and does nothing at all at the end of the row', () => {
    show()
    move('feature', '-1')
    move('feature', '1')
    expect(headOrder().slice(0, 2)).toEqual(['epic', 'feature'])
    move('epic', '-1')
    expect(headOrder().slice(0, 2)).toEqual(['epic', 'feature'])
  })

  it('remembers the order for this browser, a layout being a preference rather than a question', () => {
    show()
    move('feature', '-1')
    expect(window.localStorage.getItem('mp-table-columns')?.split(',').slice(0, 2)).toEqual([
      'feature',
      'epic',
    ])
    cleanup()
    show()
    expect(headOrder().slice(0, 2)).toEqual(['feature', 'epic'])
  })

  it('ignores a remembered order naming a column that no longer exists, rather than losing a cell', () => {
    window.localStorage.setItem('mp-table-columns', 'ghost,feature')
    show()
    expect(headOrder()).toHaveLength(9)
    expect(headOrder()[0]).toBe('feature')
  })
})

describe('what a row offers', () => {
  it('opens the feature, lands on its add-an-item field, and lands on its delete', () => {
    show()
    const cell = document.querySelector(`[data-testid="row-${FEATURE_1}"] [data-slot="row-actions"]`)
    const hrefs = [...(cell?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual([
      featurePath(PLAN_A, FEATURE_1),
      `${featurePath(PLAN_A, FEATURE_1)}#${ADD_ANCHOR}`,
      `${featurePath(PLAN_A, FEATURE_1)}#${DELETE_ANCHOR}`,
    ])
  })

  it('offers an item no add, there being nothing under an item for the link to land on', () => {
    show()
    const cell = document.querySelector(`[data-testid="row-${ITEM_1}"] [data-slot="row-actions"]`)
    const hrefs = [...(cell?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual([itemPath(PLAN_A, ITEM_1), `${itemPath(PLAN_A, ITEM_1)}#${DELETE_ANCHOR}`])
  })

  it('drops the column entirely for a viewer who may write nothing, rather than a column of blanks', () => {
    show({ writes: { rename: false, add: false, remove: false } })
    expect(document.querySelector('[data-slot="row-actions"]')).toBeNull()
    expect(headOrder()).not.toContain('actions')
    expect(document.querySelector(`#${colId('actions')}`)).toBeNull()
  })

  it('offers a delete without an add to a viewer who may remove but not create', () => {
    show({ writes: { rename: true, add: false, remove: true } })
    const cell = document.querySelector(`[data-testid="row-${FEATURE_1}"] [data-slot="row-actions"]`)
    expect([...(cell?.querySelectorAll('a') ?? [])].map((link) => link.textContent)).toEqual([
      TABLE_WORDS.edit,
      TABLE_WORDS.remove,
    ])
  })

  it('puts the plan’s own add in the strip rather than on a row, there being one of it', () => {
    show()
    expect(screen.getByText(TABLE_WORDS.newRail).getAttribute('href')).toBe('/plans/p/new/rail?n=1')
  })
})
