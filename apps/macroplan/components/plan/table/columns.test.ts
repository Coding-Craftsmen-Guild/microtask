import { describe, expect, it } from 'vitest'
import { COLUMNS, colId, columnsFor, compareSort, DEFAULT_ORDER, moveColumn, orderFrom } from './columns'

const keys = DEFAULT_ORDER

describe('the columns the table offers', () => {
  it('opens in the order the headers are written in, which is the order §5 names', () => {
    expect(DEFAULT_ORDER).toEqual(COLUMNS.map((column) => column.key))
    expect(DEFAULT_ORDER.slice(0, 4)).toEqual(['epic', 'feature', 'item', 'group'])
  })

  it('offers a sort on every column that has one value per feature, and on no other', () => {
    const sortable = COLUMNS.filter((column) => column.sortable).map((column) => column.key)
    expect(sortable).toEqual(['epic', 'feature', 'group', 'estimate', 'sprint', 'blocked'])
  })

  it('keys each visibility checkbox on its own column and on nothing a plan could contain', () => {
    expect(COLUMNS.map((column) => colId(column.key))).toEqual(keys.map((key) => `mp-col-${key}`))
    expect(new Set(COLUMNS.map((column) => colId(column.key))).size).toBe(COLUMNS.length)
  })
})

describe('moveColumn', () => {
  it('swaps a column with the one beside it', () => {
    expect(moveColumn(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveColumn(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
  })

  it('leaves the order alone at either end, rather than wrapping a column round to the other side', () => {
    expect(moveColumn(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(moveColumn(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
  })

  it('leaves the order alone for a column it does not hold', () => {
    expect(moveColumn(['a', 'b'], 'z', 1)).toEqual(['a', 'b'])
  })
})

describe('orderFrom, which reads back what a browser remembered', () => {
  it('answers the default for nothing remembered at all', () => {
    expect(orderFrom(null)).toEqual(DEFAULT_ORDER)
    expect(orderFrom('')).toEqual(DEFAULT_ORDER)
  })

  it('answers a remembered order', () => {
    expect(orderFrom(['group', ...keys.filter((key) => key !== 'group')].join(','))).toEqual([
      'group',
      ...keys.filter((key) => key !== 'group'),
    ])
  })

  it('drops a key no column answers to, so a renamed column cannot leave a gap in the header', () => {
    expect(orderFrom(['feature', 'ghost'].join(','))).toEqual([
      'feature',
      ...keys.filter((key) => key !== 'feature'),
    ])
  })

  it('appends a column the remembered order never heard of, so a new one is never invisible', () => {
    expect(orderFrom('epic')).toEqual(['epic', ...keys.filter((key) => key !== 'epic')])
  })

  it('answers each column exactly once however often it was remembered', () => {
    expect(orderFrom('epic,epic,epic')).toEqual(DEFAULT_ORDER)
  })
})

describe('compareSort', () => {
  it('orders names, and reverses for a descending sort', () => {
    expect(compareSort('Auth', 'Billing', 'feature', 'asc')).toBeLessThan(0)
    expect(compareSort('Auth', 'Billing', 'feature', 'desc')).toBeGreaterThan(0)
  })

  it('orders days as numbers and not as words, so 9d does not follow 10d', () => {
    expect(compareSort('9', '10', 'estimate', 'asc')).toBeLessThan(0)
    expect(compareSort('9', '10', 'estimate', 'desc')).toBeGreaterThan(0)
  })

  it('puts a row with no value last whichever way the column is sorted, never first', () => {
    expect(compareSort('-1', '3', 'estimate', 'asc')).toBeGreaterThan(0)
    expect(compareSort('-1', '3', 'estimate', 'desc')).toBeGreaterThan(0)
    expect(compareSort('', 'Phase 1', 'group', 'asc')).toBeGreaterThan(0)
    expect(compareSort('', 'Phase 1', 'group', 'desc')).toBeGreaterThan(0)
  })

  it('leaves two rows with nothing to compare in the order they were already in', () => {
    expect(compareSort('', '', 'group', 'asc')).toBe(0)
    expect(compareSort('-1', '-1', 'sprint', 'desc')).toBe(0)
  })
})

describe('columnsFor', () => {
  it('draws the actions column for somebody who may use one of its links', () => {
    expect(columnsFor(true)).toEqual(COLUMNS)
  })

  it('drops it entirely for a viewer who may write nothing, rather than a column of blank cells', () => {
    expect(columnsFor(false).map((column) => column.key)).toEqual(
      DEFAULT_ORDER.filter((key) => key !== 'actions'),
    )
  })
})
