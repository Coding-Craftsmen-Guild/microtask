import type { Plan } from '@repo/api-client'
import type { ScopeValue } from '@repo/contracts'
import { breakdown, effectiveEstimate } from '@repo/schedule'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { ADMIN_CONTROLS } from '../../../lib/admin-controls'
import { planCapabilities, type PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import {
  atlasPlan,
  EPIC_1,
  EPIC_2,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  ITEM_2,
  PLAN_A,
} from '../testing/plan-fixture'
import { nothingDrawn, stubActions } from '../testing/plan-writes'
import { ITEM_ADD_WORDS } from './item-add'
import { FIELDS_HINT_ID, PANEL_BANDS, PANEL_HINTS } from './panel-words'
import { SPRINT_WORDS } from './sprint-view'
import type { TabView } from './tab-view'
import type { DrawerValues, PanelValues } from './values'

vi.mock('next/link', async () => ({
  default: (await import('../testing/next-link')).LinkDouble,
}))

// The delete navigates on success, so the panel holds a component that calls `useRouter` — which throws
// outside an App Router tree. Only `replace` is exercised here; `./delete-control.test.tsx` is where what
// it is called with is asserted.
const replaced: string[] = []

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({
    back: () => undefined,
    forward: () => undefined,
    prefetch: () => undefined,
    push: () => undefined,
    refresh: () => undefined,
    replace: (href: string) => {
      replaced.push(href)
    },
  }),
}))

const { DrawerPanel } = await import('./drawer-panel')

const FEATURE_ROW: TableRow = {
  id: FEATURE_1,
  kind: 'feature',
  epic: 'Platform',
  feature: 'Auth rewrite',
  item: null,
  group: null,
  labelId: null,
  estimate: '5d',
  sprint: 'S1',
  treatment: 'solid',
  blockedBy: [],
  railId: EPIC_1,
  block: FEATURE_1,
  search: 'platform auth rewrite',
  sort: null,
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

const BILLING = {
  colour: '#3b82f6',
  ends: '2026-10-20',
  id: FEATURE_2,
  name: 'Billing',
  railName: 'Platform',
}

// Every reading the columns draw, as `./subject-view.ts` resolves it: the days this subject occupies, the
// sprint the schedule chose, the items under its feature, and both ends of its dependencies.
const panelOf = (over: Partial<PanelValues> = {}): PanelValues => ({
  atTheEnd: 9,
  candidates: [BILLING],
  dates: '2026-09-28 → 2026-10-07',
  family: [
    { estimateDays: 3, id: ITEM_1, name: 'Sessions' },
    { estimateDays: 2, id: ITEM_2, name: 'Tokens' },
  ],
  hereColour: '#3b82f6',
  scheduledSprint: 0,
  sprintTotal: 8,
  unblocks: [],
  ...over,
})

const valuesOf = (over: Partial<DrawerValues> = {}): DrawerValues => ({
  name: 'Auth rewrite',
  estimateDays: 5,
  panel: panelOf(),
  pinSprint: null,
  place: { featureId: FEATURE_1, railId: EPIC_1, siblingIds: [FEATURE_1, FEATURE_2], targets: [] },
  plan: { calendar: CALENDAR, features: atlasPlan().features, labels: atlasPlan().labels },
  sizedByItems: false,
  ...over,
})

const VALUES: DrawerValues = valuesOf()

const ITEM_VALUES: DrawerValues = valuesOf({ estimateDays: 3, name: 'Sessions' })

const CLOSE = `/plans/${PLAN_A}`

// One tab, which is what a drawer opened on its own has; `tab-stack.test.ts` holds the stack itself.
const tabsOf = (row: TableRow): readonly TabView[] => [
  {
    active: true,
    closeHref: CLOSE,
    colour: '#3b82f6',
    href: `${CLOSE}/${row.kind === 'feature' ? 'f' : 'i'}/${row.id}`,
    id: row.id,
    kind: row.kind,
    name: row.kind === 'item' ? (row.item ?? row.feature) : row.feature,
  },
]

// The scope a seat's controls are asked about, which carries the id the kernel compares.
const SEAT: ScopeValue = { kind: 'plan', planId: PLAN_A }

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
      attention={null}
      actions={over.actions ?? stubActions()}
      closeHref={CLOSE}
      controls={over.controls ?? drawing()}
      link={null}
      description={over.description ?? null}
      planId={PLAN_A}
      row={over.row ?? FEATURE_ROW}
      tabs={tabsOf(over.row ?? FEATURE_ROW)}
      values={over.values ?? VALUES}
    />,
  )

const column = (name: string): Element | null => document.querySelector(`[data-slot="panel-${name}"]`)

const meta = (): string => document.querySelector('[data-slot="panel-meta"]')?.textContent ?? ''

const reading = (): string | null =>
  document.querySelector('[data-slot="estimate-reading"]')?.textContent ?? null

const sprintValue = () => screen.queryByRole('button', { name: 'Sprint' })

const breakdownLine = (): string | null =>
  document.querySelector('[data-slot="drawer-breakdown"]')?.textContent ?? null

const itemRows = (): readonly string[] =>
  [...document.querySelectorAll('[data-slot="item-row"] a')].map((one) => one.textContent ?? '')

describe('the panel one selection is drawn in', () => {
  it('names the feature as a heading under the plan’s own, not as a second h1', () => {
    open()
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('is a landmark named for what is open, so a reader can jump to it', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
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
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    const panel = document.querySelector('[data-slot="drawer-panel"]')
    expect(panel?.getAttribute('data-treatment')).toBe('hollow')
    expect(panel?.getAttribute('data-kind')).toBe('item')
  })

  // The `<dl>` of facts this panel used to open with is gone: Epic, Estimate and Sprint were each printed
  // as a read-only fact **and** offered as a field below, so a reader was given the same values twice and
  // had to work out which copy they could change. What is left as a reading is the line that no field can
  // state — where this subject is, and the days the schedule gave it.
  it('says where the subject is and the days it occupies, in one line over the name', () => {
    open()
    expect(meta()).toBe('Platform · 2026-09-28 → 2026-10-07')
    expect(document.querySelector('dl')).toBeNull()
  })

  it('names the feature an item flows under, that being where an item is', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(meta()).toBe('Auth rewrite · 2026-09-28 → 2026-10-07')
  })

  it('says the context alone for work the schedule placed nowhere, rather than a bare separator', () => {
    open({ values: valuesOf({ panel: panelOf({ dates: '' }) }) })
    expect(meta()).toBe('Platform')
  })

  it('closes by going back to the plan’s own URL, since the selection is the address', () => {
    open()
    expect(screen.getByRole('link', { name: 'Close' }).getAttribute('href')).toBe(CLOSE)
  })

  // The row carries the dependency and the identity column is documented not to word it: the four things
  // a stated edge can turn out to be stay the table's sentences. The **dependency column** does name the
  // plan's other features, and must — a candidate list is what one looks like — so the claim is about the
  // column that reads the subject, not about the panel.
  it('words no dependency in the readings, that vocabulary being the table’s alone', () => {
    open({
      row: { ...FEATURE_ROW, blockedBy: [{ id: FEATURE_2, name: 'Billing', state: 'set-aside' }] },
    })
    expect(column('identity')?.textContent).not.toContain('Billing')
    expect(screen.queryByText(/set aside to keep rail order/)).toBeNull()
  })

  // Two layouts rather than one, because an item has no items and no dependencies of its own: a third
  // column on an item would be an empty column, and the order controls that are its second subject need
  // the width to name both neighbours.
  it('draws a feature three columns and an item two, the first being the same on both', () => {
    open()
    expect(column('identity')).toBeTruthy()
    expect(column('edges')).toBeTruthy()
    expect(column('items')).toBeTruthy()
    expect(column('order')).toBeNull()
    cleanup()
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(column('identity')).toBeTruthy()
    expect(column('order')).toBeTruthy()
    expect(column('edges')).toBeNull()
    expect(column('items')).toBeNull()
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

  // The two halves of the same subject, disagreeing on purpose: the reading says what the schedule made
  // of the estimate and the field holds what was authored. A panel that fed the field from the row would
  // have put that whole sentence in the box.
  it('keeps the schedule’s sentence as a reading and the authored number in the field', () => {
    open({
      row: { ...FEATURE_ROW, estimate: 'planned 40d · broken down to 5d · -35d' },
      values: valuesOf({ estimateDays: 40 }),
    })
    expect(reading()).toBe('planned 40d · broken down to 5d · -35d')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe(
      '40',
    )
  })

  // Where the row's verdict is simply the number in the field, printing it would charge a line of the
  // column for a fact already on screen.
  it('prints no reading at all where the schedule agrees with the field', () => {
    open()
    expect(reading()).toBeNull()
  })

  // One sentence under the row rather than one under each field, which is the layout the wrapping row of
  // 34px controls forces: a paragraph in any one cell stretches that cell to the paragraph's width. The
  // estimate field names this element as its description (`estimate-field.test.tsx` asserts that half).
  it('says the rule once, under the row, and the fields point at it', () => {
    open()
    const hint = document.getElementById(FIELDS_HINT_ID)
    expect(hint?.textContent).toBe(PANEL_HINTS.feature)
    expect(
      screen
        .getByRole('textbox', { name: 'Estimate in days' })
        .getAttribute('aria-describedby'),
    ).toBe(FIELDS_HINT_ID)
  })

  it('says the item’s own rule on an item, items running one after another inside a feature', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(document.getElementById(FIELDS_HINT_ID)?.textContent).toBe(PANEL_HINTS.item)
  })

  it('labels the name field for an item as an item’s, the actions behind the two being different', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(screen.getByRole('textbox', { name: 'Item name' })).toBeTruthy()
  })

  it('draws the name as plain text where there is no rename to offer, and not a dead box', () => {
    open({ controls: drawing({ renameFeature: false }) })
    expect(screen.queryByRole('textbox', { name: 'Feature name' })).toBeNull()
    expect(column('identity')?.textContent).toContain('Auth rewrite')
    expect(screen.getByRole('textbox', { name: 'Estimate in days' })).toBeTruthy()
  })

  it('draws no description box on a feature, there being no description to draw', () => {
    open({ description: 'ignored' })
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
  })

  it('draws the description box for an item whose file was read', () => {
    open({ row: ITEM_ROW, description: 'Ship behind a flag', values: ITEM_VALUES })
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Description' }).value).toBe(
      'Ship behind a flag',
    )
  })

  it('draws none for an item whose description was not read, rather than an empty box', () => {
    open({ row: ITEM_ROW, description: null, values: ITEM_VALUES })
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
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
      values: ITEM_VALUES,
      actions: stubActions({ renameItem, renameFeature }),
    })
    const user = userEvent.setup()
    await user.clear(screen.getByRole('textbox', { name: 'Item name' }))
    await user.type(screen.getByRole('textbox', { name: 'Item name' }), 'Sessions v2{Enter}')
    expect(renameItem).toHaveBeenCalledWith(PLAN_A, ITEM_1, 'Sessions v2')
    expect(renameFeature).not.toHaveBeenCalled()
  })

  // The assertion that matters about a control, per `lib/plan-capabilities.ts`: a control is a rendering
  // answer and never a gate, so the thing worth pinning is that a write the API refuses still says so on
  // screen — not that anything was hidden.
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

// The picker that replaced "Move to another rail": the opener is the field — *which rail is this on* —
// and opening it offers the alternatives. A pick lands at the end of that rail, which is the only
// position a subject has among children it has never been beside (`./place-picker.tsx`).
describe('the picker that moves work between parents', () => {
  const targets = [{ colour: '#112233', id: EPIC_2, name: 'Payments' }]

  it('shows the rail a feature is on, and the feature an item is under', () => {
    open()
    expect(column('identity')?.textContent).toContain('Epic')
    cleanup()
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(column('identity')?.textContent).toContain('Feature')
  })

  it('offers every other rail of the plan and marks the one the feature is already on', () => {
    open({ values: valuesOf({ place: { ...VALUES.place, targets } }) })
    expect(screen.getByRole('button', { name: 'Payments' })).toBeTruthy()
    expect(screen.getByText('current')).toBeTruthy()
  })

  it('moves the feature to the end of the rail that was picked', async () => {
    const actions = stubActions()
    open({ actions, values: valuesOf({ place: { ...VALUES.place, targets } }) })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Payments' }))
    expect(actions.placeFeature).toHaveBeenCalledWith(PLAN_A, FEATURE_1, {
      epicId: EPIC_2,
      position: 9,
    })
  })

  it('moves an item to the end of the feature that was picked, which is the other placement', async () => {
    const actions = stubActions()
    open({
      actions,
      row: ITEM_ROW,
      values: valuesOf({
        estimateDays: 3,
        name: 'Sessions',
        place: { ...VALUES.place, targets: [{ colour: '#3b82f6', id: FEATURE_2, name: 'Billing' }] },
      }),
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Billing' }))
    expect(actions.placeItem).toHaveBeenCalledWith(PLAN_A, ITEM_1, {
      featureId: FEATURE_2,
      position: 9,
    })
  })

  it('draws none where the placement control says so, or where no epic claims the rail', () => {
    open({ controls: drawing({ placeFeature: false }) })
    expect(screen.queryByText('current')).toBeNull()
    cleanup()
    open({ values: valuesOf({ place: { ...VALUES.place, railId: null } }) })
    expect(screen.queryByText('current')).toBeNull()
  })
})

// The pin is the one control on this panel a `write` seat is refused, so the thing worth pinning is that
// it is drawn on its own boolean and on the feature kind. It is never a gate: the API answers the click.
describe('the sprint, which a feature pins and an item only reads', () => {
  it('draws the stepper for a feature, showing the pin where there is one', () => {
    open({ values: valuesOf({ pinSprint: 2 }) })
    expect(sprintValue()?.textContent).toContain('S3')
    expect(sprintValue()?.textContent).toContain(SPRINT_WORDS.pinned)
  })

  it('shows the schedule’s own sprint for a feature nobody pinned, rather than an empty box', () => {
    open()
    expect(sprintValue()?.textContent).toContain('S1')
    expect(sprintValue()?.textContent).toContain(SPRINT_WORDS.loose)
  })

  // Only a feature carries a pin: an item's dates follow its order inside its feature, so a stepper
  // there would be a control with nothing to write.
  it('draws a flat reading for an item, PlanItem carrying no pin to edit', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(sprintValue()).toBeNull()
    expect(document.querySelector('[data-slot="sprint-pill"]')?.textContent).toContain('S1')
  })

  it('draws none where pinFeature is false while still drawing the fields beside it', () => {
    open({ controls: drawing({ pinFeature: false }) })
    expect(sprintValue()).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Feature name' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Estimate in days' })).toBeTruthy()
  })

  it('sends pinFeature alone and never the estimate beside it, the two being two authorities', async () => {
    const pinFeature = vi.fn(() => Promise.resolve(served))
    const estimateFeature = vi.fn(() => Promise.resolve(served))
    open({ actions: stubActions({ pinFeature, estimateFeature }) })
    await userEvent.setup().click(screen.getByRole('button', { name: SPRINT_WORDS.more }))
    expect(pinFeature).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 1)
    expect(estimateFeature).not.toHaveBeenCalled()
  })
})

describe('the dependency column, and the one control an item drawer must never draw', () => {
  // Spec §3.1: a feature is a contiguous block, and "contiguity is what makes an edge between two
  // features mean something at the year rung, and it is why edges exist at the feature level and nowhere
  // else". `PlanItem` carries no `dependsOn` at all, so there is no item form of this to draw.
  it('draws no dependency control at all on an item, edges existing at the feature level only', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.queryByText(PANEL_BANDS.waits)).toBeNull()
  })

  it('draws one box per other feature of the plan for a feature, named by what it waits on', () => {
    open()
    expect(screen.getByText(PANEL_BANDS.waits)).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Billing' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Auth rewrite' })).toBeNull()
  })

  // The same relation read from the other end, which is the half a feature's own panel cannot deduce:
  // nothing else on screen says what is waiting on **this**.
  it('says what waits on this feature, as links rather than as controls', () => {
    open({ values: valuesOf({ panel: panelOf({ unblocks: [BILLING] }) }) })
    expect(screen.getByText(PANEL_BANDS.unblocks)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Billing/ }).getAttribute('href')).toBe(
      `${CLOSE}/f/${FEATURE_2}?open=f:${FEATURE_1},f:${FEATURE_2}`,
    )
  })

  it('says nothing waits on it where nothing does, rather than leaving the band out', () => {
    open()
    expect(screen.getByText(PANEL_BANDS.noUnblocks)).toBeTruthy()
  })

  it('draws neither band where setDependencies is false, while still drawing the pin beside it', () => {
    open({ controls: drawing({ setDependencies: false }) })
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.queryByText(PANEL_BANDS.unblocks)).toBeNull()
    expect(sprintValue()).toBeTruthy()
  })
})

// The column the panel moved under the board for: breaking a feature down was eight navigations before
// it, and is one screen now.
describe('the items column, which is where a feature is broken down', () => {
  it('lists the feature’s items in order, each a link to its own panel', () => {
    open()
    expect(itemRows()).toEqual(['Sessions', 'Tokens'])
    expect(screen.getByRole('link', { name: 'Tokens' }).getAttribute('href')).toBe(
      `${CLOSE}/i/${ITEM_2}?open=f:${FEATURE_1},i:${ITEM_2}`,
    )
  })

  it('says how many there are and what they add up to', () => {
    open()
    expect(screen.getByText('2 · 5d total')).toBeTruthy()
  })

  it('says none are sized where no item of the feature is', () => {
    const unsized = panelOf({
      family: [
        { estimateDays: null, id: ITEM_1, name: 'Sessions' },
        { estimateDays: null, id: ITEM_2, name: 'Tokens' },
      ],
    })
    open({ values: valuesOf({ panel: unsized }) })
    expect(screen.getByText('2 · none sized')).toBeTruthy()
  })

  it('sizes one item from its own row, sending that item’s id and not the feature’s', async () => {
    const actions = stubActions()
    open({ actions })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Half a day more for Tokens' }))
    expect(actions.estimateItem).toHaveBeenCalledWith(PLAN_A, ITEM_2, 2.5)
    expect(actions.estimateFeature).not.toHaveBeenCalled()
  })

  it('adds an item to this feature from the last row of the list', async () => {
    const actions = stubActions()
    open({ actions })
    const user = userEvent.setup()
    await user.click(screen.getByRole('textbox', { name: ITEM_ADD_WORDS.label }))
    await user.paste('Token rotation')
    await user.click(screen.getByRole('button', { name: ITEM_ADD_WORDS.action }))
    expect(actions.createItem).toHaveBeenCalledWith(PLAN_A, {
      featureId: FEATURE_1,
      name: 'Token rotation',
    })
  })

  it('says a feature with no items has none, that being how a feature gets a size of its own', () => {
    open({ values: valuesOf({ panel: panelOf({ family: [] }) }) })
    expect(screen.getByText(PANEL_BANDS.noItems)).toBeTruthy()
  })

  it('draws no steppers and no add row where those controls say so', () => {
    open({ controls: drawing({ createItem: false, estimateItem: false }) })
    expect(itemRows()).toEqual(['Sessions', 'Tokens'])
    expect(screen.queryByRole('textbox', { name: ITEM_ADD_WORDS.label })).toBeNull()
    expect(screen.queryByRole('button', { name: /Half a day more for/ })).toBeNull()
  })
})

// An item's second column: its dates are not its own — items run one after another inside their feature
// — so order is the only thing on its panel that changes when it happens.
describe('the order column, which is an item’s whole second subject', () => {
  it('says where this item sits among its siblings', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(screen.getByText(PANEL_BANDS.order)).toBeTruthy()
    expect(screen.getByText('1 of 2 · 2026-09-28 → 2026-10-07')).toBeTruthy()
  })

  it('names both neighbours, each a link to its own panel', () => {
    open({ row: { ...ITEM_ROW, id: ITEM_2 }, values: valuesOf({ name: 'Tokens' }) })
    expect(screen.getByRole('link', { name: 'Sessions' }).getAttribute('href')).toBe(
      `${CLOSE}/i/${ITEM_1}?open=i:${ITEM_2},i:${ITEM_1}`,
    )
    expect(screen.getByText(PANEL_BANDS.end)).toBeTruthy()
  })

  it('says the ends of the feature where there is no neighbour that way', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(screen.getByText(PANEL_BANDS.start)).toBeTruthy()
    expect(screen.getByText('Tokens')).toBeTruthy()
  })

  it('moves the item one place later, as a placement among its siblings', async () => {
    const actions = stubActions()
    open({ actions, row: ITEM_ROW, values: ITEM_VALUES })
    await userEvent.setup().click(screen.getByRole('button', { name: PANEL_BANDS.later }))
    expect(actions.placeItem).toHaveBeenCalledWith(PLAN_A, ITEM_1, {
      featureId: FEATURE_1,
      position: 1,
    })
  })

  it('disables the step that would move it off the end of its feature', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(
      screen.getByRole('button', { name: PANEL_BANDS.earlier }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('draws no steps where placeItem is false, while still naming the neighbours', () => {
    open({ controls: drawing({ placeItem: false }), row: ITEM_ROW, values: ITEM_VALUES })
    expect(screen.queryByRole('button', { name: PANEL_BANDS.later })).toBeNull()
    expect(screen.getByText(PANEL_BANDS.start)).toBeTruthy()
  })
})

// The one destructive control, which is `manage`-tier and now sits on the **tab** rather than among the
// fields: it is an action on the thing the tab names rather than a value of it, and a destructive button
// at the foot of a column of inputs is one in tab order after every input.
describe('the delete, and the fact that the kind picks the write rather than a caller', () => {
  it('draws it for a feature and sends removeFeature with the plan and the feature', async () => {
    const actions = stubActions()
    open({ actions })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete feature' }))
    expect(actions.removeFeature).toHaveBeenCalledWith(PLAN_A, FEATURE_1)
    expect(actions.removeItem).not.toHaveBeenCalled()
  })

  it('draws it for an item and sends removeItem, the two ids being indistinguishable strings', async () => {
    const actions = stubActions()
    open({ actions, row: ITEM_ROW, values: ITEM_VALUES })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete item' }))
    expect(actions.removeItem).toHaveBeenCalledWith(PLAN_A, ITEM_1)
    expect(actions.removeFeature).not.toHaveBeenCalled()
  })

  it('sits in the tab strip rather than in a column, so no column ends in a red button', () => {
    open()
    expect(
      screen.getByRole('button', { name: 'Delete' }).closest('[data-slot="panel-tabs"]'),
    ).toBeTruthy()
  })

  // The stored value and not the row's wording: the two are the same string on the fixture, so the
  // values are given a name the row does not carry to tell which of the two the question quotes.
  it('quotes the subject’s stored name, which is the value the field edits', async () => {
    open({ values: valuesOf({ name: 'Auth rewrite v2' }) })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('heading', { name: 'Delete “Auth rewrite v2”?' })).toBeTruthy()
  })

  it('draws none where removeFeature is false while still drawing the pin beside it', () => {
    open({ controls: drawing({ removeFeature: false }) })
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(sprintValue()).toBeTruthy()
  })

  it('draws none for an item where removeItem is false, the two booleans being two actions', () => {
    open({ controls: drawing({ removeItem: false }), row: ITEM_ROW, values: ITEM_VALUES })
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})

// `feature:pin` and `feature:depend` are `manage`-only where `feature:rename`, `feature:estimate` and
// `item:describe` are `write` (`MANAGE` and `WRITE` in `packages/kernel/src/access/policy.ts`), so which
// control a seat is shown *is* the role line. `lib/plan-capabilities.test.ts` pins the policy side row by
// row; what nothing would otherwise catch is a control drawn for the wrong tier.
describe('what each seat is shown, which is the capability line drawn as layout', () => {
  it('shows a write seat the fields and neither the pin nor the edges', () => {
    open({ controls: planCapabilities('write', SEAT).content })
    expect(screen.getByRole('textbox', { name: 'Feature name' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Estimate in days' })).toBeTruthy()
    expect(sprintValue()).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  // `item:create` is a `write` action, so the one thing a write seat may do in the items column is add
  // to it — which is the asymmetry worth pinning, the column itself being a reading.
  it('shows a write seat the items column with its add row, the creates being write-tier', () => {
    open({ controls: planCapabilities('write', SEAT).content })
    expect(screen.getByRole('textbox', { name: ITEM_ADD_WORDS.label })).toBeTruthy()
  })

  it('shows a manage seat the pin, the edges and the delete as well', () => {
    open({ controls: planCapabilities('manage', SEAT).content })
    expect(sprintValue()).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Billing' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('shows a view seat no control at all, there being nothing on this panel it may write', () => {
    open({ controls: planCapabilities('view', SEAT).content })
    expect(screen.queryAllByRole('textbox')).toEqual([])
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('still reads the plan to a view seat, a panel with no controls not being an empty panel', () => {
    open({ controls: planCapabilities('view', SEAT).content })
    expect(meta()).toBe('Platform · 2026-09-28 → 2026-10-07')
    expect(itemRows()).toEqual(['Sessions', 'Tokens'])
  })
})

const featureOne = () => {
  const found = atlasPlan().features.find((one) => one.id === FEATURE_1)
  if (found === undefined) throw new Error('the fixture no longer holds FEATURE_1')
  return found
}

const itemsOfOne = () => atlasPlan().items.filter((one) => one.featureId === FEATURE_1)

// §3.2's own sentence is the row's and appears in the Estimate cell. What this line adds is which of a
// feature's two estimates the timeline used, and the assertion below is that it repeats none of the row.
describe('the breakdown line, which says what the Estimate cell has no room to', () => {
  it('says the timeline placed the feature by its items, wherever the items sized it', () => {
    open({ values: valuesOf({ sizedByItems: true }) })
    expect(breakdownLine()).toContain('places this feature by its items')
  })

  it('draws nothing where the items did not, which is what an item always resolves to', () => {
    open({ row: ITEM_ROW, values: ITEM_VALUES })
    expect(breakdownLine()).toBeNull()
  })

  it('leaves every number of the pair to the row, repeating not one of them', () => {
    open({
      row: { ...FEATURE_ROW, estimate: 'planned 40d · broken down to 62d · +22d' },
      values: valuesOf({ estimateDays: 40, sizedByItems: true }),
    })
    expect(reading()).toBe('planned 40d · broken down to 62d · +22d')
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

  // The state the line used to be silent in, end to end: the reading shows what the items came to and
  // the field beside it is empty, because nothing was authored. Only the line accounts for the two.
  it('is on screen where the reading is the items’ sum and the estimate field holds nothing', () => {
    open({
      row: { ...FEATURE_ROW, estimate: '5d' },
      values: valuesOf({ estimateDays: null, sizedByItems: true }),
    })
    expect(reading()).toBe('5d')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe('')
    expect(breakdownLine()).toContain('changing it moves no bar')
  })
})

// ADR 0051, asserted rather than described, because it reads as a bug to anyone who has not been told:
// `effectiveEstimate` takes the items whenever at least one of them is estimated, so a `write` seat
// typing into the estimate field of a broken-down feature sees the discrepancy change and the canvas stay
// still. The panel's half of that is what this file can check — the field really sends the new authored
// number, the row's sentence is what moves, and the spans the canvas draws come from the schedule the API
// answered rather than from anything this field wrote.
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
