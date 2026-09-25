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
import { atlasPlan, EPIC_1, FEATURE_1, FEATURE_2, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { nothingDrawn, stubActions } from '../testing/plan-writes'
import type { DrawerValues } from './values'

vi.mock('next/link', async () => ({
  default: (await import('../testing/next-link')).LinkDouble,
}))

// The delete navigates on success, so the panel now holds a component that calls `useRouter` — which
// throws outside an App Router tree. Only `replace` is exercised here; `./delete-control.test.tsx` is
// where what it is called with is asserted.
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
  place: { featureId: FEATURE_1, railId: EPIC_1 },
  plan: { calendar: CALENDAR, features: atlasPlan().features },
  sizedByItems: false,
  ...over,
})

const VALUES: DrawerValues = valuesOf()

const CLOSE = `/plans/${PLAN_A}`

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

  // The row carries the dependency and the read half is documented not to draw it. Every other row in
  // this file has an empty `blockedBy`, so nothing there could tell "deliberately not drawn" from
  // "there was nothing to draw" — and a later edit could start wording an edge here in a second
  // vocabulary with no case going red. What the `<dl>` must not word is both of `PlanTableRow`'s
  // halves: the name it would print, and the suffix `EDGE_SUFFIX` would print after it.
  //
  // The **editor** does name the plan's other features, and must: a candidate list is what one looks
  // like (`drawer-manage.tsx`). So the claim is narrowed to the half it was always about — the facts
  // `<dl>` words no edge, and the four things a stated edge can turn out to be stay the table's
  // sentences — rather than to "this panel never prints another feature's name", which a dependency
  // control makes false on purpose.
  it('words no dependency in the facts list, that vocabulary being the table’s alone', () => {
    open({ row: { ...FEATURE_ROW, blockedBy: [{ id: FEATURE_2, name: 'Billing', state: 'set-aside' }] } })
    expect(labels()).toEqual(['Epic', 'Estimate', 'Sprint'])
    expect(document.querySelector('dl')?.textContent).not.toContain('Billing')
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

// The three control bands, in the order the panel draws them: the `write` fields about the subject, the
// `manage` controls, then the creates — which are `write`-tier and outside the tier split, being about a
// parent rather than about this subject. Found by the variant that hides an empty one, which is what each
// of them *is*.
const bands = (): readonly Element[] => [...document.querySelectorAll('[class*="empty:hidden"]')]

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

// The second band the panel draws: every control in it is granted to `manage` alone, and the two it
// holds today are a **feature's** alone (`drawer-manage.tsx`).
describe('the manage band, and the one control an item drawer must never draw', () => {
  // Spec §3.1: a feature is a contiguous block, and "contiguity is what makes an edge between two
  // features mean something at the year rung, and it is why edges exist at the feature level and
  // nowhere else". `PlanItem` carries no `dependsOn` at all, so there is no item form of this to draw.
  it('draws no dependency control at all on an item, edges existing at the feature level only', () => {
    open({ row: ITEM_ROW, values: valuesOf({ name: 'Sessions', estimateDays: 3 }) })
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.queryByText('Waits on')).toBeNull()
  })

  it('draws one box per other feature of the plan for a feature, named by what it waits on', () => {
    open()
    expect(screen.getByText('Waits on')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Billing' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Auth rewrite' })).toBeNull()
  })

  it('draws none where setDependencies is false while still drawing the pin beside it', () => {
    open({ controls: drawing({ setDependencies: false }) })
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(pinBox()).toBeTruthy()
  })

  // `empty:hidden` is a Tailwind variant and not a count, so what makes a band disappear is the
  // element being **childless** — which is the thing worth asserting, a stylesheet not being loaded
  // here. Both bands are checked, because a read-only seat must be shown neither box.
  it('leaves every band childless for a surface that may write nothing, so none is shown', () => {
    open({ controls: nothingDrawn() })
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(pinBox()).toBeNull()
    expect(bands().map((band) => band.childElementCount)).toEqual([0, 0, 0])
  })

  // **The claim the second band was opened for**, which four files' prose asserted and no test asked:
  // `feature:pin` and `feature:depend` are `manage`-only where `feature:rename`, `feature:estimate` and
  // `item:describe` are `write` (`MANAGE` and `WRITE` in `packages/kernel/src/access/policy.ts`), so the
  // split between the two files *is* the role line. `lib/plan-capabilities.test.ts` pins the policy side
  // row by row, so a policy change goes red there; what nothing caught until now is a control mounted in
  // the **wrong band**, which is the mistake three more groups make easy. The controls come from
  // `planCapabilities` rather than from an object written here, so the seat asked about is the one the
  // server would answer for.
  it('shows a write seat the edits band and an empty manage band, and a manage seat both', () => {
    open({ controls: planCapabilities('write', SEAT).content })
    expect(screen.getByRole('textbox', { name: 'Feature name' })).toBeTruthy()
    expect(pinBox()).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(bands().map((band) => band.childElementCount > 0)).toEqual([true, false, true])
    cleanup()
    open({ controls: planCapabilities('manage', SEAT).content })
    expect(bands().map((band) => band.childElementCount > 0)).toEqual([true, true, true])
    expect(pinBox()).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Billing' })).toBeTruthy()
  })

  // The create band is the `true` in the middle case above, and it is the one band whose tier is not the
  // band's: `feature:create` and `item:create` are `write` actions, so a `write` seat is shown the creates
  // and refused the pin, the edges and the delete beside them (`packages/kernel/src/access/policy.ts`).
  it('shows a write seat the creates, whose actions are write-tier, and not the delete', () => {
    open({ controls: planCapabilities('write', SEAT).content })
    expect(screen.getByRole('textbox', { name: 'New feature on this rail' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'New item in this feature' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('shows a view seat no band at all, there being nothing on this panel it may write', () => {
    open({ controls: planCapabilities('view', SEAT).content })
    expect(bands().map((band) => band.childElementCount)).toEqual([0, 0, 0])
  })
})

// The one destructive control, which is `manage`-tier and so lives in the second band. What is asserted
// here is the mount: that it is drawn for both kinds, on its own boolean, and wired to **this** kind's
// write. `./delete-control.test.tsx` holds the dialog, the focus and the navigation.
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
    open({ actions, row: ITEM_ROW, values: valuesOf({ name: 'Sessions', estimateDays: 3 }) })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete item' }))
    expect(actions.removeItem).toHaveBeenCalledWith(PLAN_A, ITEM_1)
    expect(actions.removeFeature).not.toHaveBeenCalled()
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
    expect(pinBox()).toBeTruthy()
  })

  it('draws none for an item where removeItem is false, the two booleans being two actions', () => {
    open({
      controls: drawing({ removeItem: false }),
      row: ITEM_ROW,
      values: valuesOf({ name: 'Sessions' }),
    })
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})

// The create group, which is the one group mounted by the frame rather than by a band: its parents are
// `values.place`, resolved in the same lookup as the row, so a drawer open on an **item** adds a feature
// to that item's rail and an item to that item's feature — never to the item.
describe('the creates, which are about a parent and not about the subject', () => {
  it('adds a feature to the open feature’s own rail', async () => {
    const actions = stubActions()
    open({ actions })
    const user = userEvent.setup()
    await user.click(screen.getByRole('textbox', { name: 'New feature on this rail' }))
    await user.paste('Sessions rework')
    await user.click(screen.getByRole('button', { name: 'Add feature' }))
    expect(actions.createFeature).toHaveBeenCalledWith(PLAN_A, {
      epicId: EPIC_1,
      name: 'Sessions rework',
    })
  })

  it('adds an item to the open item’s **feature**, which is the parent an item drawer cannot invent', async () => {
    const actions = stubActions()
    open({
      actions,
      row: ITEM_ROW,
      values: valuesOf({ estimateDays: 3, name: 'Sessions', place: { featureId: FEATURE_1, railId: EPIC_1 } }),
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('textbox', { name: 'New item in this feature' }))
    await user.paste('Token rotation')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(actions.createItem).toHaveBeenCalledWith(PLAN_A, {
      featureId: FEATURE_1,
      name: 'Token rotation',
    })
  })

  it('draws each box only where its own control says so', () => {
    open({ controls: drawing({ createFeature: false }) })
    expect(screen.queryByRole('textbox', { name: 'New feature on this rail' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'New item in this feature' })).toBeTruthy()
  })

  it('draws no feature box where no epic of the plan claims the subject’s rail', () => {
    open({ values: valuesOf({ place: { featureId: FEATURE_1, railId: null } }) })
    expect(screen.queryByRole('textbox', { name: 'New feature on this rail' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'New item in this feature' })).toBeTruthy()
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
