import type { Plan } from '@repo/api-client'
import { itemsToMarks, railLayout } from '@repo/canvas'
import { LIMITS } from '@repo/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanCanvas } from '../canvas/plan-canvas'
import { CANVAS_SCALE } from '../canvas/view'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  ITEM_2,
  ITEM_3,
  unplacedPlan,
} from '../testing/plan-fixture'
import { PlanTable } from './plan-table'

const AT = new Date('2026-10-05T09:00:00.000Z')

const COLUMNS = ['Epic', 'Feature', 'Item', 'Estimate', 'Sprint', 'Progress', 'Blocked by']

const NAME = 'Table of Atlas rollout'

const all = (selector: string): readonly Element[] => [...document.querySelectorAll(selector)]

const rowFor = (id: string): HTMLElement => screen.getByTestId(`row-${id}`)

const cells = (id: string): readonly string[] =>
  [...rowFor(id).children].map((cell) => cell.textContent ?? '')

const GHOST = '01MPFFFFFFFFFFFFFFFFFFFFF9'

const withDependsOn = (base: Plan, id: string, dependsOn: readonly string[]): Plan => ({
  ...base,
  features: base.features.map((one) => (one.id === id ? { ...one, dependsOn } : one)),
})

const withIgnoredEdge = (base: Plan, featureId: string, dependsOnId: string): Plan => ({
  ...base,
  schedule: { ...base.schedule, ignoredEdges: [{ featureId, dependsOnId }] },
})

const edgeIn = (rowId: string): Element | null =>
  rowFor(rowId).querySelector('[data-slot="blocked-by"]')

const stamps = { createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' }

const ITEMS_PER_FEATURE = LIMITS.itemsPerPlan / LIMITS.featuresPerPlan

const planAtCap = (): Plan => {
  const base = atlasPlan()
  const features = Array.from({ length: LIMITS.featuresPerPlan }, (_, index) => ({
    id: `f-${String(index)}`,
    epicId: base.epics[0]?.id ?? '',
    name: `Feature ${String(index)}`,
    position: index,
    estimateDays: ITEMS_PER_FEATURE,
    pinSprint: null,
    dependsOn: [],
    ...stamps,
  }))
  const items = Array.from({ length: LIMITS.itemsPerPlan }, (_, index) => ({
    id: `i-${String(index)}`,
    featureId: `f-${String(Math.floor(index / ITEMS_PER_FEATURE))}`,
    name: `Item ${String(index)}`,
    position: index % ITEMS_PER_FEATURE,
    estimateDays: 1,
    linkedTaskId: null,
    ...stamps,
  }))
  const spans = [
    ...features.map((one, index) => ({
      id: one.id,
      startDay: index * ITEMS_PER_FEATURE,
      endDay: (index + 1) * ITEMS_PER_FEATURE,
    })),
    ...items.map((one, index) => ({ id: one.id, startDay: index, endDay: index + 1 })),
  ]
  return { ...base, features, items, schedule: { ...base.schedule, spans } }
}

describe('the parity that makes the table a second rendering of the same data', () => {
  it('names every feature the canvas draws a bar for, so the table is no summary of it', () => {
    const plan = atlasPlan()
    const drawn = railLayout(plan, plan.schedule, CANVAS_SCALE).flatMap((rail) =>
      rail.bars.map((bar) => bar.id),
    )
    render(<PlanTable plan={planScreenModel(plan)} />)
    expect(drawn).toEqual([FEATURE_1, FEATURE_2])
    for (const id of drawn) expect(rowFor(id), id).toBeTruthy()
  })

  it('names every item the canvas draws a mark for, which a table of features alone would not', () => {
    const plan = atlasPlan()
    const drawn = itemsToMarks(plan, plan.schedule, CANVAS_SCALE).map((mark) => mark.id)
    render(<PlanTable plan={planScreenModel(plan)} />)
    expect(drawn).toEqual([ITEM_1, ITEM_2, ITEM_3])
    for (const id of drawn) expect(rowFor(id), id).toBeTruthy()
  })

  it('names every id the canvas actually emits an element for, bars, marks and stubs alike', () => {
    const cases = [
      { plan: atlasPlan(), stubs: [] as readonly string[] },
      { plan: unplacedPlan('no-estimate'), stubs: [FEATURE_2] },
      { plan: unplacedPlan('in-cycle'), stubs: [FEATURE_2] },
    ]
    for (const one of cases) {
      render(<PlanCanvas at={AT} place={null} plan={planScreenModel(one.plan)} />)
      const drawn = all('[data-feature-id], [data-item-id]').map(
        (mark) => mark.getAttribute('data-feature-id') ?? mark.getAttribute('data-item-id') ?? '',
      )
      const stubbed = all('[data-placed="false"]').map(
        (stub) => stub.getAttribute('data-feature-id') ?? '',
      )
      cleanup()
      expect(stubbed, 'the off-axis stubs the canvas drew').toEqual(one.stubs)
      expect(drawn.length).toBeGreaterThan(2)
      render(<PlanTable plan={planScreenModel(one.plan)} />)
      for (const id of [...drawn, ...stubbed]) expect(rowFor(id), id).toBeTruthy()
      cleanup()
    }
  })

  it('names an unplaced feature’s own items too, which the canvas draws nothing whatever for', () => {
    const plan = unplacedPlan('no-estimate')
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(plan)} />)
    expect(all(`[data-item-id="${ITEM_3}"]`)).toHaveLength(0)
    cleanup()
    render(<PlanTable plan={planScreenModel(plan)} />)
    expect(rowFor(ITEM_3).getAttribute('data-treatment')).toBe('hollow')
  })

  it('carries the canvas’s own treatment on the row, so neither rendering states it alone', () => {
    render(<PlanTable plan={planScreenModel(unplacedPlan('in-cycle'))} />)
    expect(rowFor(FEATURE_2).getAttribute('data-treatment')).toBe('contradicted')
    expect(rowFor(FEATURE_1).getAttribute('data-treatment')).toBe('solid')
  })
})

describe('the table as a screen reader meets it', () => {
  it('is one named table, reached by its role and its name and never by a test hook', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    expect(screen.getByRole('table', { name: NAME })).toBeTruthy()
  })

  it('is named for what it is, against the canvas’s own name for the same plan', () => {
    render(
      <div>
        <PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} />
        <PlanTable plan={planScreenModel(atlasPlan())} />
      </div>,
    )
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(screen.getByRole('table', { name: NAME })).toBeTruthy()
  })

  it('heads every column with a scoped header, in §5’s own order', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    const heads = screen.getAllByRole('columnheader')
    expect(heads.map((head) => head.textContent)).toEqual(COLUMNS)
    for (const head of heads) expect(head.getAttribute('scope'), head.textContent ?? '').toBe('col')
  })

  it('makes each row’s own subject its row header, so a cell is never read without one', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    const headers = screen.getAllByRole('rowheader')
    expect(headers.map((header) => header.textContent)).toEqual([
      'Auth rewrite',
      'Sessions',
      'Password reset',
      'Billing',
      'Invoices',
    ])
    for (const header of headers) expect(header.getAttribute('scope')).toBe('row')
  })

  it('discriminates a feature row from an item row by an attribute and not by paint', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    expect(rowFor(FEATURE_1).getAttribute('data-kind')).toBe('feature')
    expect(rowFor(ITEM_1).getAttribute('data-kind')).toBe('item')
  })

  it('repeats the epic and the feature on every row, rather than spanning a cell down the table', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    // Seven cells now, and the progress one is empty on both: nothing in this fixture is linked, and
    // a feature never carries a counted number of its own whatever its items are linked to.
    expect(cells(ITEM_2)).toEqual(['Platform', 'Auth rewrite', 'Password reset', '2d', 'S1', '', ''])
    expect(cells(FEATURE_1)).toEqual(['Platform', 'Auth rewrite', '', '5d', 'S1', '', ''])
    expect(all('[rowspan], [colspan]')).toHaveLength(0)
  })
})

// §5's seventh column, which phase 2 left out and said why in a caption. Phase 4 fills it and the
// caption is gone: what replaced it is that the column is now **empty** wherever there is no counted
// number, which says the same thing in the one place a reader is looking.
describe('the progress column, and the numbers it refuses to invent', () => {
  const linked = (itemId: string, done: number, total: number) => ({
    itemId,
    progress: { done, total },
  })

  it('heads the column §5 names, in §5’s own order', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    expect(COLUMNS).toContain('Progress')
    expect(screen.queryByRole('columnheader', { name: 'Progress' })).not.toBeNull()
  })

  it('carries no caption at all now, the column it apologised for being here', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    expect(document.querySelector('caption')).toBeNull()
  })

  it('invents no percentage for a plan with nothing linked, which is the whole rule (§7.2)', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    expect(screen.getByRole('table', { name: NAME }).textContent).not.toContain('%')
  })

  it('says the percentage and the count for a linked item, so neither hides the other', () => {
    const plan = planScreenModel(atlasPlan())
    const item = plan.items[0]
    if (item === undefined) throw new Error('the fixture holds items')
    render(<PlanTable plan={plan} progress={[linked(item.id, 1, 4)]} />)
    const row = screen.getByTestId(`row-${item.id}`)
    expect(row.textContent).toContain('25%')
    expect(row.textContent).toContain('1 of 4 done')
  })

  // A linked task with no checklist counts {done: 0, total: 0}. 0% would be a number nobody counted,
  // and on screen indistinguishable from a task where everything is still to do.
  it('says "nothing counted yet" for a linked task with no checklist, rather than 0%', () => {
    const plan = planScreenModel(atlasPlan())
    const item = plan.items[0]
    if (item === undefined) throw new Error('the fixture holds items')
    render(<PlanTable plan={plan} progress={[linked(item.id, 0, 0)]} />)
    expect(screen.getByTestId(`row-${item.id}`).textContent).toContain('nothing counted yet')
  })

  it('leaves a feature row’s cell empty, a feature having no counted number of its own', () => {
    const plan = planScreenModel(atlasPlan())
    const feature = plan.features[0]
    const item = plan.items[0]
    if (feature === undefined || item === undefined) throw new Error('the fixture holds both')
    render(<PlanTable plan={plan} progress={[linked(item.id, 2, 2)]} />)
    const cell = screen.getByTestId(`row-${feature.id}`).querySelector('[data-slot="progress"]')
    expect(cell?.textContent).toBe('')
  })

  it('leaves an unlinked item’s cell empty too, so absence is one rendering and not three', () => {
    const plan = planScreenModel(atlasPlan())
    const item = plan.items[1]
    if (item === undefined) throw new Error('the fixture holds a second item')
    render(<PlanTable plan={plan} progress={[]} />)
    const cell = screen.getByTestId(`row-${item.id}`).querySelector('[data-slot="progress"]')
    expect(cell?.textContent).toBe('')
  })
})

describe('the blocked-by cell', () => {
  it('names the feature a feature waits on, rather than the id it states it by', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    const edges = rowFor(FEATURE_2).querySelectorAll('[data-slot="blocked-by"]')
    expect([...edges].map((edge) => edge.textContent)).toEqual(['Auth rewrite'])
    expect(edges[0]?.getAttribute('data-edge')).toBe('honoured')
  })

  it('says in words that an edge was set aside, and carries the same fact as an attribute', () => {
    render(<PlanTable plan={planScreenModel(withIgnoredEdge(atlasPlan(), FEATURE_2, FEATURE_1))} />)
    expect(edgeIn(FEATURE_2)?.textContent).toBe('Auth rewrite · set aside to keep rail order')
    expect(edgeIn(FEATURE_2)?.getAttribute('data-edge')).toBe('set-aside')
  })

  it('says in words that an edge names nothing in this plan, which the pass never reports at all', () => {
    render(<PlanTable plan={planScreenModel(withDependsOn(atlasPlan(), FEATURE_2, [GHOST]))} />)
    expect(edgeIn(FEATURE_2)?.textContent).toBe(`${GHOST} · names nothing in this plan`)
    expect(edgeIn(FEATURE_2)?.getAttribute('data-edge')).toBe('unknown')
  })

  it('says in words that an edge points at something unplaced, which the pass also never reports', () => {
    render(<PlanTable plan={planScreenModel(withDependsOn(unplacedPlan('no-estimate'), FEATURE_1, [FEATURE_2]))} />)
    expect(edgeIn(FEATURE_1)?.textContent).toBe('Billing · not placed, so it gave this no date')
    expect(edgeIn(FEATURE_1)?.getAttribute('data-edge')).toBe('unplaced')
  })

  it('gives each of the four states its own sentence, so a reordered table cannot go unnoticed', () => {
    const atlas = atlasPlan()
    const cases = [
      { plan: atlas as Plan, row: FEATURE_2 },
      { plan: withIgnoredEdge(atlas, FEATURE_2, FEATURE_1), row: FEATURE_2 },
      { plan: withDependsOn(atlas, FEATURE_2, [GHOST]), row: FEATURE_2 },
      { plan: withDependsOn(unplacedPlan('no-estimate'), FEATURE_1, [FEATURE_2]), row: FEATURE_1 },
    ]
    const said: string[] = []
    const states: string[] = []
    for (const one of cases) {
      render(<PlanTable plan={planScreenModel(one.plan)} />)
      said.push(edgeIn(one.row)?.textContent ?? '')
      states.push(edgeIn(one.row)?.getAttribute('data-edge') ?? '')
      cleanup()
    }
    expect(states).toEqual(['honoured', 'set-aside', 'unknown', 'unplaced'])
    expect(new Set(said).size).toBe(4)
  })

  it('leaves the cell empty for a feature nothing blocks, and for every item row', () => {
    render(<PlanTable plan={planScreenModel(atlasPlan())} />)
    expect(rowFor(FEATURE_1).querySelectorAll('[data-slot="blocked-by"]')).toHaveLength(0)
    expect(rowFor(ITEM_1).querySelectorAll('[data-slot="blocked-by"]')).toHaveLength(0)
  })
})

// Rendering 2 200 rows through happy-dom is intrinsically slow, and vitest's 5s default is not
// calibrated for it: this test passes in isolation and timed out under `turbo run … --force`, where
// a dozen packages transform and build at once on one machine. The allowance is per-test rather than
// per-package so a hang anywhere in the other 572 still fails fast.
const CAP_RENDER_MS = 60_000

describe('the table at this product’s own cap', { timeout: CAP_RENDER_MS }, () => {
  it('renders a row per feature and per item at the 2 000-item cap, and no wrapper per row', () => {
    render(<PlanTable plan={planScreenModel(planAtCap())} />)
    const rows = all('[data-slot="plan-table-row"]')
    expect(rows).toHaveLength(LIMITS.itemsPerPlan + LIMITS.featuresPerPlan)
    for (const row of rows) expect(row.children).toHaveLength(COLUMNS.length)
  })
})
