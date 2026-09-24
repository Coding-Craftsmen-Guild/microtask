import type { Plan } from '@repo/api-client'
import { breakdown, effectiveEstimate } from '@repo/schedule'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { ADMIN_CONTROLS } from '../../../lib/admin-controls'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { nothingDrawn, stubActions } from '../testing/plan-writes'
import type { DrawerValues } from './values'

vi.mock('next/link', async () => ({
  default: (await import('../testing/next-link')).LinkDouble,
}))

const { DrawerPanel } = await import('./drawer-panel')

const FEATURE_ROW: TableRow = {
  id: FEATURE_1,
  kind: 'feature',
  epic: 'Platform',
  feature: 'Auth rewrite',
  item: null,
  estimate: '5d',
  sprint: 'S1',
  treatment: 'solid',
  blockedBy: [],
}

const ITEM_ROW: TableRow = {
  ...FEATURE_ROW,
  id: ITEM_1,
  kind: 'item',
  item: 'Sessions',
  estimate: '3d',
  treatment: 'hollow',
  blockedBy: [],
}

const CALENDAR = {
  startDate: atlasPlan().startDate,
  sprintLengthDays: atlasPlan().sprintLengthDays,
  timezone: atlasPlan().timezone,
}

const valuesOf = (over: Partial<DrawerValues> = {}): DrawerValues => ({
  name: 'Auth rewrite',
  estimateDays: 5,
  pinSprint: null,
  calendar: CALENDAR,
  sizedByItems: false,
  ...over,
})

const VALUES: DrawerValues = valuesOf()

const CLOSE = `/plans/${PLAN_A}`

const served: ActionResult<Plan> = { ok: true, value: atlasPlan() }

const drawing = (over: Partial<PlanContentControls> = {}): PlanContentControls => ({
  ...ADMIN_CONTROLS.content,
  ...over,
})

interface Open {
  readonly row?: TableRow
  readonly values?: DrawerValues
  readonly description?: string | null
  readonly controls?: PlanContentControls
  readonly actions?: PlanEditActions
}

const open = (over: Open = {}) =>
  render(
    <DrawerPanel
      actions={over.actions ?? stubActions()}
      closeHref={CLOSE}
      controls={over.controls ?? drawing()}
      description={over.description ?? null}
      planId={PLAN_A}
      row={over.row ?? FEATURE_ROW}
      values={over.values ?? VALUES}
    />,
  )

const labels = (): readonly string[] =>
  [...document.querySelectorAll('dt')].map((node) => node.textContent ?? '')

const valueOf = (label: string): string =>
  [...document.querySelectorAll('dt')]
    .filter((node) => node.textContent === label)
    .map((node) => node.nextElementSibling?.textContent ?? '')
    .join('')

describe('the panel one selection is drawn in', () => {
  it('names the feature as a heading under the plan’s own, not as a second h1', () => {
    open()
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('is a landmark named for what is open, so a reader can jump to it', () => {
    open({ row: ITEM_ROW })
    expect(screen.getByRole('complementary', { name: 'Sessions' })).toBeTruthy()
  })

  it('says which of the two kinds of thing this is, in words and not only in paint', () => {
    open()
    expect(screen.getByText('Feature')).toBeTruthy()
    expect(document.querySelector('[data-slot="drawer-panel"]')?.getAttribute('data-kind')).toBe(
      'feature',
    )
  })

  it('carries the treatment as data, because two subjects can render the same words', () => {
    open({ row: ITEM_ROW })
    const panel = document.querySelector('[data-slot="drawer-panel"]')
    expect(panel?.getAttribute('data-treatment')).toBe('hollow')
    expect(panel?.getAttribute('data-kind')).toBe('item')
  })

  it('repeats not one word the row already decided, reading each straight off it', () => {
    open()
    expect(valueOf('Epic')).toBe('Platform')
    expect(valueOf('Estimate')).toBe('5d')
    expect(valueOf('Sprint')).toBe('S1')
  })

  it('names the feature an item flows under, which a feature’s own panel has no room to repeat', () => {
    open({ row: ITEM_ROW })
    expect(labels()).toEqual(['Epic', 'Feature', 'Estimate', 'Sprint'])
    expect(valueOf('Feature')).toBe('Auth rewrite')
  })

  it('leaves the feature row out of that list, the heading having just said it', () => {
    open()
    expect(labels()).toEqual(['Epic', 'Estimate', 'Sprint'])
  })

  it('closes by going back to the plan’s own URL, since the selection is the address', () => {
    open()
    expect(screen.getByRole('link', { name: 'Close' }).getAttribute('href')).toBe(CLOSE)
  })

  // The row carries the dependency and the panel is documented not to draw it. Every other row in
  // this file has an empty `blockedBy`, so nothing there could tell "deliberately not drawn" from
  // "there was nothing to draw" — and a later edit could start wording an edge here in a second
  // vocabulary with no case going red. Both of `PlanTableRow`'s halves of the sentence are checked:
  // the name it would print, and the suffix `EDGE_SUFFIX` would print after it.
  it('draws no dependency even when the row states one, that wording being the table’s alone', () => {
    open({ row: { ...FEATURE_ROW, blockedBy: [{ id: FEATURE_2, name: 'Billing', state: 'set-aside' }] } })
    expect(labels()).toEqual(['Epic', 'Estimate', 'Sprint'])
    expect(screen.queryByText(/Billing/)).toBeNull()
    expect(screen.queryByText(/set aside to keep rail order/)).toBeNull()
    expect(document.body.textContent).not.toContain(FEATURE_2)
  })
})

describe('the fields it draws, from the values rather than from the words', () => {
  it('seeds the name field with the stored name and the estimate with the stored number', () => {
    open({ values: valuesOf({ estimateDays: 40 }) })
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Feature name' }).value).toBe(
      'Auth rewrite',
    )
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe(
      '40',
    )
  })

  // The two halves of the same subject, disagreeing on purpose: the `<dd>` says what the schedule made
  // of the estimate and the field holds what was authored. A panel that fed the field from the row
  // would have put that whole sentence in the box.
  it('keeps the schedule’s sentence in the list and the authored number in the field', () => {
    open({
      row: { ...FEATURE_ROW, estimate: 'planned 40d · broken down to 5d · -35d' },
      values: valuesOf({ estimateDays: 40 }),
    })
    expect(valueOf('Estimate')).toBe('planned 40d · broken down to 5d · -35d')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe(
      '40',
    )
  })

  it('labels the name field for an item as an item’s, the actions behind the two being different', () => {
    open({ row: ITEM_ROW, values: valuesOf({ name: 'Sessions', estimateDays: 3 }) })
    expect(screen.getByRole('textbox', { name: 'Item name' })).toBeTruthy()
  })

  it('draws no description box on a feature, there being no description to draw', () => {
    open({ description: 'ignored' })
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
  })

  it('draws the description box for an item whose file was read', () => {
    open({ row: ITEM_ROW, description: 'Ship behind a flag' })
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Description' }).value).toBe(
      'Ship behind a flag',
    )
  })

  it('draws none for an item whose description was not read, rather than an empty box', () => {
    open({ row: ITEM_ROW, description: null })
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
  })

  it('draws each field only where its own control says so', () => {
    open({ controls: drawing({ renameFeature: false }) })
    expect(screen.queryByRole('textbox', { name: 'Feature name' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Estimate in days' })).toBeTruthy()
  })

  it('draws no field at all for a surface that may write nothing', () => {
    open({ row: ITEM_ROW, description: 'Ship behind a flag', controls: nothingDrawn() })
    expect(screen.queryAllByRole('textbox')).toEqual([])
  })

  it('sends the write the subject’s own kind names, and never the other kind’s', async () => {
    const renameItem = vi.fn(() => Promise.resolve(served))
    const renameFeature = vi.fn(() => Promise.resolve(served))
    open({
      row: ITEM_ROW,
      values: valuesOf({ name: 'Sessions', estimateDays: 3 }),
      actions: stubActions({ renameItem, renameFeature }),
    })
    const user = userEvent.setup()
    await user.clear(screen.getByRole('textbox', { name: 'Item name' }))
    await user.type(screen.getByRole('textbox', { name: 'Item name' }), 'Sessions v2{Enter}')
    expect(renameItem).toHaveBeenCalledWith(PLAN_A, ITEM_1, 'Sessions v2')
    expect(renameFeature).not.toHaveBeenCalled()
  })

  // The assertion that matters about a control, per `lib/plan-capabilities.ts`: a control is a
  // rendering answer and never a gate, so the thing worth pinning is that a write the API refuses
  // still says so on screen — not that anything was hidden.
  it('surfaces the sentence a refused write came back with, the control having decided nothing', async () => {
    const renameFeature = vi.fn(() =>
      Promise.resolve<ActionResult<Plan>>({
        ok: false,
        status: 403,
        detail: 'Not permitted: feature:rename',
      }),
    )
    open({ actions: stubActions({ renameFeature }) })
    const user = userEvent.setup()
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Feature name' })
    await user.clear(field)
    await user.type(field, 'Renamed{Enter}')
    expect(screen.getByRole('alert').textContent).toBe('Not permitted: feature:rename')
    expect(field.value).toBe('Auth rewrite')
  })
})

const featureOne = () => {
  const found = atlasPlan().features.find((one) => one.id === FEATURE_1)
  if (found === undefined) throw new Error('the fixture no longer holds FEATURE_1')
  return found
}

const itemsOfOne = () => atlasPlan().items.filter((one) => one.featureId === FEATURE_1)

const pinBox = () => screen.queryByRole<HTMLInputElement>('textbox', { name: 'Pinned to sprint' })

const breakdownLine = (): string | null =>
  document.querySelector('[data-slot="drawer-breakdown"]')?.textContent ?? null

// The pin is the one control on this panel a `write` seat is refused, so the thing worth pinning is
// that it is drawn on its own boolean and on the feature kind — and that a seat holding the other two
// still gets those. It is never a gate: the API answers the click (`lib/plan-capabilities.ts`).
describe('the pin, which is the manage-tier control among the write-tier fields', () => {
  it('draws it for a feature, seeded one above the stored 0-based index', () => {
    open({ values: valuesOf({ pinSprint: 2 }) })
    expect(pinBox()?.value).toBe('3')
  })

  it('draws an empty box for a feature nobody pinned, rather than no box at all', () => {
    open()
    expect(pinBox()?.value).toBe('')
  })

  it('draws none for an item, PlanItem carrying no pin to edit', () => {
    open({ row: ITEM_ROW, values: valuesOf({ name: 'Sessions', estimateDays: 3 }) })
    expect(pinBox()).toBeNull()
  })

  it('draws none where pinFeature is false while still drawing the two write fields', () => {
    open({ controls: drawing({ pinFeature: false }) })
    expect(pinBox()).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Feature name' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Estimate in days' })).toBeTruthy()
  })

  it('sends pinFeature alone and never the estimate beside it, the two being two authorities', async () => {
    const pinFeature = vi.fn(() => Promise.resolve(served))
    const estimateFeature = vi.fn(() => Promise.resolve(served))
    open({ actions: stubActions({ pinFeature, estimateFeature }) })
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'Pinned to sprint' }), '3{Enter}')
    expect(pinFeature).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 2)
    expect(estimateFeature).not.toHaveBeenCalled()
  })

  it('says the sprint’s own dates under the box rather than leaving a bare index on screen', () => {
    open({ values: valuesOf({ pinSprint: 0 }) })
    expect(document.body.textContent).toContain('Sprint 1 runs 2026-09-28 to 2026-10-15')
  })
})

// §3.2's own sentence is the row's and appears in the Estimate cell. What this line adds is which of a
// feature's two estimates the timeline used, and the assertion below is that it repeats none of the row.
describe('the breakdown line, which says what the Estimate cell has no room to', () => {
  it('says the timeline placed the feature by its items, wherever the items sized it', () => {
    open({ values: valuesOf({ sizedByItems: true }) })
    expect(breakdownLine()).toContain('places this feature by its items')
  })

  it('draws nothing where the items did not, which is what an item always resolves to', () => {
    open({ row: ITEM_ROW, values: valuesOf({ name: 'Sessions', estimateDays: 3 }) })
    expect(breakdownLine()).toBeNull()
  })

  it('leaves every number of the pair to the row, repeating not one of them', () => {
    open({
      row: { ...FEATURE_ROW, estimate: 'planned 40d · broken down to 62d · +22d' },
      values: valuesOf({ estimateDays: 40, sizedByItems: true }),
    })
    expect(valueOf('Estimate')).toBe('planned 40d · broken down to 62d · +22d')
    expect(breakdownLine()).not.toMatch(/[0-9]/)
  })

  it('renders the same sentence for a shortfall, a negative delta being reportable and not an error', () => {
    open({
      row: { ...FEATURE_ROW, estimate: 'planned 40d · broken down to 62d · +22d' },
      values: valuesOf({ estimateDays: 40, sizedByItems: true }),
    })
    const overrun = breakdownLine()
    cleanup()
    open({
      row: { ...FEATURE_ROW, estimate: 'planned 40d · broken down to 5d · -35d' },
      values: valuesOf({ estimateDays: 40, sizedByItems: true }),
    })
    expect(breakdownLine()).toBe(overrun)
  })

  // The state the line used to be silent in, end to end: the cell shows what the items came to and the
  // field beside it is empty, because nothing was authored. Only the line accounts for the two.
  it('is on screen where the cell reads the items’ sum and the estimate field holds nothing', () => {
    open({
      row: { ...FEATURE_ROW, estimate: '5d' },
      values: valuesOf({ estimateDays: null, sizedByItems: true }),
    })
    expect(valueOf('Estimate')).toBe('5d')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe('')
    expect(breakdownLine()).toContain('changing it moves no bar')
  })

  it('sits outside the facts list, a sentence with no <dt> being no part of one', () => {
    open({ values: valuesOf({ sizedByItems: true }) })
    expect(labels()).toEqual(['Epic', 'Estimate', 'Sprint'])
    expect(document.querySelector('dl [data-slot="drawer-breakdown"]')).toBeNull()
    expect(breakdownLine()).toBeTruthy()
  })
})

// ADR 0051, asserted rather than described, because it reads as a bug to anyone who has not been told:
// `effectiveEstimate` takes the items whenever at least one of them is estimated, so a `write` seat
// typing into the estimate field of a broken-down feature sees the discrepancy change and the canvas
// stay still. The panel's half of that is what this file can check — the field really sends the new
// authored number, the row's sentence is what moves, and the spans the canvas draws come from the
// schedule the API answered rather than from anything this field wrote.
describe('an estimate authored on a broken-down feature: the gap moves and the bar does not', () => {
  it('sends the authored estimate while the timeline keeps placing the feature by its items', async () => {
    const estimateFeature = vi.fn(() => Promise.resolve(served))
    open({
      actions: stubActions({ estimateFeature }),
      values: valuesOf({ estimateDays: 5, sizedByItems: true }),
    })
    const user = userEvent.setup()
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' })
    await user.clear(field)
    await user.type(field, '40{Enter}')
    expect(estimateFeature).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 40)
    const items = itemsOfOne()
    expect(effectiveEstimate({ ...featureOne(), estimateDays: 40 }, items)).toBe(5)
    expect(breakdown({ ...featureOne(), estimateDays: 40 }, items)?.delta).toBe(-35)
  })

  it('leaves the authored estimate standing where no item of the feature is sized', () => {
    const unsized = itemsOfOne().map((one) => ({ ...one, estimateDays: null }))
    const feature = { ...featureOne(), estimateDays: 40 }
    expect(effectiveEstimate(feature, unsized)).toBe(40)
    expect(breakdown(feature, unsized)).toBeNull()
  })

  it('says so on screen, the line being exactly the states in which the field is inert', () => {
    open({ values: valuesOf({ estimateDays: 5, sizedByItems: true }) })
    expect(breakdownLine()).toContain('changing it moves no bar')
  })
})
