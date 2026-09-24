import type { Plan } from '@repo/api-client'
import { itemsToMarks, railLayout } from '@repo/canvas'
import { describe, expect, it } from 'vitest'
import { CANVAS_SCALE } from '../canvas/view'
import {
  atlasPlan,
  CREATED,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  ITEM_2,
  ITEM_3,
  STAMP,
  unplacedPlan,
} from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { tableRows as rowsOfModel, type TableRow } from './rows'

// `tableRows` takes a `PlanScreenModel` now — the type a share token cannot be represented in — and
// every fixture here is a `StoredPlan` carrying three seats. The reducer both surfaces' reads use is
// what turns one into the other, so it is applied here rather than at forty call sites, and the name
// stays `tableRows` so each case below still reads as a call to the function under test.
const tableRows = (plan: Plan): readonly TableRow[] => rowsOfModel(planScreenModel(plan))

const SCALE = CANVAS_SCALE

const ORPHAN = '01MPHHHHHHHHHHHHHHHHHHHHH9'

const GHOST = '01MPFFFFFFFFFFFFFFFFFFFFF9'

const plan = (over: Partial<Plan> = {}): Plan => ({ ...atlasPlan(), ...over })

const rowOf = (rows: readonly TableRow[], id: string): TableRow => {
  const found = rows.find((row) => row.id === id)
  if (found === undefined) throw new Error(`no row for ${id}`)
  return found
}

const scheduleOf = (base: Plan, over: Partial<Plan['schedule']>): Plan['schedule'] => ({
  ...base.schedule,
  ...over,
})

const withFeature = (over: Partial<Plan['features'][number]>, id = FEATURE_2): Plan => {
  const base = atlasPlan()
  return plan({ features: base.features.map((one) => (one.id === id ? { ...one, ...over } : one)) })
}

describe('what the table has a row for', () => {
  it('names every feature and every item, so the table is a second rendering and not a summary', () => {
    const rows = tableRows(atlasPlan())
    expect(rows.map((row) => row.id)).toEqual([FEATURE_1, ITEM_1, ITEM_2, FEATURE_2, ITEM_3])
    expect(rows.map((row) => row.kind)).toEqual(['feature', 'item', 'item', 'feature', 'item'])
  })

  it('orders its rows in the order the forward pass placed spans, never a sort of its own', () => {
    const one = atlasPlan()
    const reversed = plan({ features: [...one.features].reverse(), items: [...one.items].reverse() })
    expect(tableRows(reversed).map((row) => row.id)).toEqual(tableRows(one).map((row) => row.id))
  })

  it('names every feature bar and every item mark the canvas draws, by the id it draws it for', () => {
    const one = atlasPlan()
    const drawn = [
      ...railLayout(one, one.schedule, SCALE).flatMap((rail) => rail.bars.map((bar) => bar.id)),
      ...itemsToMarks(one, one.schedule, SCALE).map((mark) => mark.id),
    ]
    const named = new Set(tableRows(one).map((row) => row.id))
    expect(drawn.length).toBe(5)
    for (const id of drawn) expect(named.has(id), id).toBe(true)
  })

  it('names an unplaced feature too, which the canvas can only draw as an off-axis stub', () => {
    const one = unplacedPlan('no-estimate')
    expect(rowOf(tableRows(one), FEATURE_2).treatment).toBe('hollow')
    expect(railLayout(one, one.schedule, SCALE)[0]?.bars).toHaveLength(1)
  })

  it('names an unestimated item under a placed feature, which the canvas draws nothing at all for', () => {
    const base = atlasPlan()
    const one = plan({
      items: base.items.map((item) => (item.id === ITEM_2 ? { ...item, estimateDays: null } : item)),
      schedule: scheduleOf(base, {
        spans: base.schedule.spans.filter((span) => span.id !== ITEM_2),
        unscheduled: [{ id: ITEM_2, reason: 'no-estimate' }],
      }),
    })
    expect(itemsToMarks(one, one.schedule, SCALE).map((mark) => mark.id)).toEqual([ITEM_1, ITEM_3])
    expect(rowOf(tableRows(one), ITEM_2).sprint).toBe('not placed · no estimate')
  })

  it('leaves out an item naming no feature, which is the same absence the canvas has', () => {
    const base = atlasPlan()
    const orphan = {
      id: ORPHAN,
      featureId: GHOST,
      name: 'Stray',
      position: 0,
      estimateDays: 1,
      linkedTaskId: null,
      createdAt: CREATED,
      updatedAt: STAMP,
    }
    const one = plan({ items: [...base.items, orphan] })
    expect(tableRows(one).map((row) => row.id)).not.toContain(ORPHAN)
    expect(itemsToMarks(one, one.schedule, SCALE).map((mark) => mark.id)).not.toContain(ORPHAN)
  })
})

describe('the epic, feature and item each row names', () => {
  it('repeats its epic and its feature on every row, so a row read alone is complete', () => {
    const rows = tableRows(atlasPlan())
    expect(rowOf(rows, ITEM_2)).toMatchObject({
      epic: 'Platform',
      feature: 'Auth rewrite',
      item: 'Password reset',
    })
    expect(rowOf(rows, FEATURE_1).item).toBeNull()
  })

  it('says the same words for a rail no epic claims as the canvas draws for it', () => {
    expect(rowOf(tableRows(plan({ epics: [] })), FEATURE_1).epic).toBe('Unclaimed rail')
  })

  it('joins names back to the plan, because the derived order carries ids and no names', () => {
    const renamed = plan({ epics: atlasPlan().epics.map((one) => ({ ...one, name: 'Core' })) })
    expect(rowOf(tableRows(renamed), FEATURE_1).epic).toBe('Core')
  })
})

describe('the estimate column, which §3.2 calls the most useful number in the application', () => {
  it('states the gap when the authored estimate and the breakdown disagree', () => {
    const base = atlasPlan()
    const one = plan({
      features: base.features.map((f) => (f.id === FEATURE_1 ? { ...f, estimateDays: 40 } : f)),
    })
    expect(rowOf(tableRows(one), FEATURE_1).estimate).toBe(
      'planned 40d · broken down to 5d · -35d',
    )
  })

  it('signs a breakdown that overruns what was authored, so the gap reads as what it adds', () => {
    const base = atlasPlan()
    const one = plan({
      items: base.items.map((i) => (i.id === ITEM_1 ? { ...i, estimateDays: 40 } : i)),
    })
    expect(rowOf(tableRows(one), FEATURE_1).estimate).toBe(
      'planned 5d · broken down to 42d · +37d',
    )
  })

  it('states one number when the two agree, because a zero gap is no gap to report', () => {
    expect(rowOf(tableRows(atlasPlan()), FEATURE_1).estimate).toBe('5d')
  })

  it('falls back to the authored estimate for a feature nothing under it was sized', () => {
    const base = withFeature({ estimateDays: 9 })
    const one = plan({
      features: base.features,
      items: base.items.map((i) => (i.id === ITEM_3 ? { ...i, estimateDays: null } : i)),
    })
    expect(rowOf(tableRows(one), FEATURE_2).estimate).toBe('9d')
  })

  it('says no estimate rather than 0d, which is a milestone and a different fact', () => {
    const childless = (estimateDays: number | null): Plan => {
      const base = withFeature({ estimateDays })
      return plan({
        features: base.features,
        items: base.items.filter((item) => item.featureId !== FEATURE_2),
      })
    }
    expect(rowOf(tableRows(childless(null)), FEATURE_2).estimate).toBe('no estimate')
    expect(rowOf(tableRows(childless(0)), FEATURE_2).estimate).toBe('0d')
  })

  it('reads an item’s estimate off the item, and says when it has none', () => {
    const base = atlasPlan()
    const one = plan({
      items: base.items.map((i) => (i.id === ITEM_1 ? { ...i, estimateDays: null } : i)),
    })
    expect(rowOf(tableRows(one), ITEM_1).estimate).toBe('no estimate')
    expect(rowOf(tableRows(base), ITEM_1).estimate).toBe('3d')
  })
})

describe('the sprint column, which is arithmetic and never an assignment', () => {
  it('labels the sprint the span starts in, one-based, from sprintOf and not from division', () => {
    const rows = tableRows(atlasPlan())
    expect(rows.map((row) => row.sprint)).toEqual(['S1', 'S1', 'S1', 'S1', 'S1'])
  })

  it('names both ends when a span straddles a boundary, because §3.3 lets it straddle silently', () => {
    const base = atlasPlan()
    const one = plan({
      schedule: scheduleOf(base, {
        spans: base.schedule.spans.map((span) =>
          span.id === FEATURE_2 ? { ...span, startDay: 10, endDay: 20 } : span,
        ),
      }),
    })
    expect(rowOf(tableRows(one), FEATURE_2).sprint).toBe('S1–S2')
  })

  it('keeps a zero-day milestone in its own sprint, rather than in the one before it', () => {
    const base = atlasPlan()
    const one = plan({
      schedule: scheduleOf(base, {
        spans: base.schedule.spans.map((span) =>
          span.id === FEATURE_2 ? { ...span, startDay: 14, endDay: 14 } : span,
        ),
      }),
    })
    expect(rowOf(tableRows(one), FEATURE_2).sprint).toBe('S2')
  })

  it('reads the plan’s own sprint length, so a retimed plan renumbers every row', () => {
    const one = plan({ sprintLengthDays: 2 })
    expect(rowOf(tableRows(one), FEATURE_1).sprint).toBe('S1–S3')
    expect(rowOf(tableRows(one), ITEM_2).sprint).toBe('S2–S3')
  })

  it('says why a row has no sprint at all, and says the two reasons differently', () => {
    expect(rowOf(tableRows(unplacedPlan('no-estimate')), FEATURE_2).sprint).toBe(
      'not placed · no estimate',
    )
    expect(rowOf(tableRows(unplacedPlan('in-cycle')), FEATURE_2).sprint).toBe(
      'not placed · in a dependency cycle',
    )
    expect(rowOf(tableRows(unplacedPlan('in-cycle')), ITEM_3).treatment).toBe('contradicted')
  })
})

describe('the blocked-by column, which reads dependsOn and ignoredEdges together', () => {
  it('names what a feature waits on, and nothing for a feature that waits on nothing', () => {
    const rows = tableRows(atlasPlan())
    expect(rowOf(rows, FEATURE_2).blockedBy).toEqual([
      { id: FEATURE_1, name: 'Auth rewrite', state: 'honoured' },
    ])
    expect(rowOf(rows, FEATURE_1).blockedBy).toEqual([])
    expect(rowOf(rows, ITEM_3).blockedBy).toEqual([])
  })

  it('says an edge was set aside when the pass reported it, which dependsOn alone cannot say', () => {
    const base = atlasPlan()
    const one = plan({
      schedule: scheduleOf(base, {
        ignoredEdges: [{ featureId: FEATURE_2, dependsOnId: FEATURE_1 }],
      }),
    })
    expect(rowOf(tableRows(one), FEATURE_2).blockedBy[0]?.state).toBe('set-aside')
  })

  it('says an edge names nothing in this plan, which the pass never reports at all', () => {
    const edge = rowOf(tableRows(withFeature({ dependsOn: [GHOST] })), FEATURE_2).blockedBy[0]
    expect(edge).toEqual({ id: GHOST, name: GHOST, state: 'unknown' })
  })

  it('says an edge points at something unplaced, which the pass also never reports', () => {
    const base = unplacedPlan('no-estimate')
    const one = plan({
      features: base.features.map((f) =>
        f.id === FEATURE_1 ? { ...f, dependsOn: [FEATURE_2] } : f,
      ),
      schedule: base.schedule,
    })
    expect(rowOf(tableRows(one), FEATURE_1).blockedBy[0]?.state).toBe('unplaced')
  })

  it('reads honoured as what the schedule reports, never as a comparison of days it re-derives', () => {
    const row = rowOf(tableRows(unplacedPlan('no-estimate')), FEATURE_2)
    expect(row.blockedBy).toEqual([{ id: FEATURE_1, name: 'Auth rewrite', state: 'honoured' }])
    expect(row.sprint).toBe('not placed · no estimate')
  })

  it('reads the epic a rail belongs to from the plan, so the rail id is never shown as a name', () => {
    expect(rowOf(tableRows(atlasPlan()), FEATURE_1).epic).not.toContain(EPIC_1)
  })
})
