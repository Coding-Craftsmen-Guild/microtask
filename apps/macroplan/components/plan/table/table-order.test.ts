import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1, ITEM_2, ITEM_3, LABEL_1, railedPlan, EPIC_2 } from '../testing/plan-fixture'
import { COLUMNS } from './columns'
import { tableRows } from './rows'
import { arrangedRows, narrowingIn, orderedColumns, type Narrowed } from './table-order'

const EVERYTHING: Narrowed = { needle: '', rail: '', group: '' }

const atlasRows = () => tableRows(planScreenModel(atlasPlan()))

const shown = (arranged: ReturnType<typeof arrangedRows>) => arranged.filter((one) => !one.hidden).map((one) => one.row.id)

describe('arrangedRows narrows the table by blocks, the way a reader reads it', () => {
  it('shows every row in the derived order when nothing narrows it', () => {
    const arranged = arrangedRows(atlasRows(), EVERYTHING, null)
    expect(arranged.map((one) => one.row.id)).toEqual(atlasRows().map((row) => row.id))
    expect(arranged.every((one) => !one.hidden)).toBe(true)
  })

  it('keeps a feature whole when the feature itself matches', () => {
    expect(shown(arrangedRows(atlasRows(), { ...EVERYTHING, needle: 'auth' }, null))).toEqual([FEATURE_1, ITEM_1, ITEM_2])
  })

  it('keeps a matching item under its own feature, and drops the item’s siblings', () => {
    expect(shown(arrangedRows(atlasRows(), { ...EVERYTHING, needle: 'invoices' }, null))).toEqual([FEATURE_2, ITEM_3])
  })

  it('filters by rail and by group together with the search', () => {
    const rows = tableRows(planScreenModel(railedPlan()))
    expect(shown(arrangedRows(rows, { ...EVERYTHING, rail: EPIC_2 }, null)).every((id) => rows.find((row) => row.id === id)?.railId === EPIC_2)).toBe(true)
    expect(shown(arrangedRows(atlasRows(), { ...EVERYTHING, group: LABEL_1 }, null))).toEqual([FEATURE_1, ITEM_1, ITEM_2])
    expect(shown(arrangedRows(atlasRows(), { ...EVERYTHING, group: 'none' }, null))).toEqual([FEATURE_2, ITEM_3])
  })

  it('moves whole blocks when sorted, and reverses them on descending', () => {
    const asc = arrangedRows(atlasRows(), EVERYTHING, { column: 'feature', direction: 'asc' })
    const desc = arrangedRows(atlasRows(), EVERYTHING, { column: 'feature', direction: 'desc' })
    expect(asc.map((one) => one.row.id)).toEqual([FEATURE_1, ITEM_1, ITEM_2, FEATURE_2, ITEM_3])
    expect(desc.map((one) => one.row.id)).toEqual([FEATURE_2, ITEM_3, FEATURE_1, ITEM_1, ITEM_2])
  })
})

describe('narrowingIn lets go of a filter the plan no longer offers', () => {
  const plan = () => planScreenModel(railedPlan())

  it('hands back the very narrowing when every filter in it is still on offer', () => {
    const narrowed: Narrowed = { needle: 'x', rail: EPIC_2, group: 'none' }
    expect(narrowingIn(narrowed, plan())).toBe(narrowed)
  })

  it('drops a rail and a group the plan no longer holds, keeping the search', () => {
    expect(narrowingIn({ needle: 'x', rail: 'gone-rail', group: 'gone-group' }, plan())).toEqual({
      needle: 'x',
      rail: '',
      group: '',
    })
  })

  it('keeps a group the plan still holds', () => {
    const narrowed: Narrowed = { ...EVERYTHING, group: LABEL_1 }
    expect(narrowingIn(narrowed, planScreenModel(atlasPlan()))).toBe(narrowed)
  })
})

describe('orderedColumns lays the columns out in the order a reader chose', () => {
  it('follows the chosen order and keeps only the columns on offer', () => {
    const offered = COLUMNS.filter((column) => column.key !== 'actions')
    const chosen = ['item', 'epic', 'actions', 'feature', 'group', 'estimate', 'sprint', 'progress', 'blocked']
    expect(orderedColumns(offered, chosen).map((column) => column.key)).toEqual([
      'item', 'epic', 'feature', 'group', 'estimate', 'sprint', 'progress', 'blocked',
    ])
  })
})
