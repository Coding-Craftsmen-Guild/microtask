import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemDrawerRead } from '../../../actions/drawer-reads'
import type { ActionResult } from '../../../actions/result'
import { ADMIN_CONTROLS } from '../../../lib/admin-controls'
import { featurePath, groupPath, itemPath, PLAN_DRAWERS, railPath } from '../../../lib/drawer-routes'
import { planCapabilities } from '../../../lib/plan-capabilities'
import { linkPath, planPath } from '../../../lib/routes'
import { PlanNavProvider, SHALLOW, type PlanNav } from '../nav/plan-nav'
import { planScreenModel, type PlanScreenModel } from '../plan-screen-model'
import type { BindProjectWrite } from '../bridge/bind-project-form'
import { ITEM_ADD_WORDS } from '../drawer/item-add'
import { ADD_ANCHOR, DELETE_ANCHOR } from '../table/row-actions'
import { LINK_WORDS } from '../drawer/link-field'
import { seatDoubles } from '../share/testing/seat-doubles'
import {
  atlasPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  FEATURE_GONE,
  ITEM_1,
  ITEM_3,
  LABEL_1,
  LABEL_GONE,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  SEAT_TOKEN,
  unplacedPlan,
  type StoredPlan,
} from '../testing/plan-fixture'
import { addItem } from '../store/item-edits'
import { addRail } from '../store/rail-edits'
import { NEW_RAIL_WORDS } from '../rails/new-rail-form'
import { stubActions, stubPlanWrites } from '../testing/plan-writes'
import { GONE } from './drawer-gone'
import { PlanApp, type PlanAppProps } from './plan-app'
import type { ItemRead } from './plan-session'

// The address is the browser's own, as it is on the page: the drawer reads it through Next's two hooks, and
// those follow `history.pushState`, so here they read `window.location` — and a move made through `PlanNav`
// re-renders the tree below it, as Next's router does when it hears one (`Routed`).
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

const AT = '2026-10-05T09:00:00.000Z'

const NO_SUCH_ITEM = '01MPHHHHHHHHHHHHHHHHHHHHH9'

const NO_SUCH_RAIL = '01MPEEEEEEEEEEEEEEEEEEEEE7'

const nothingRead: ActionResult<ItemDrawerRead> = { ok: true, value: { description: '', tasks: null } }

interface Opened {
  readonly plan?: StoredPlan
  readonly surface?: PlanAppProps['surface']
  readonly controls?: PlanAppProps['controls']
  readonly readItem?: ItemRead
  readonly bindProject?: BindProjectWrite
}

function Routed(props: PlanAppProps) {
  const [, moved] = useState(0)
  const nav = useMemo<PlanNav>(
    () => ({
      go: (href, options) => {
        SHALLOW.go(href, options)
        moved((count) => count + 1)
      },
    }),
    [],
  )
  return (
    <PlanNavProvider value={nav}>
      <PlanApp {...props} />
    </PlanNavProvider>
  )
}

/** The plan screen as the layout hands it over, opened at `path`, with every write a spy. */
const open = (path: string, over: Opened = {}) => {
  window.history.replaceState(null, '', path)
  const readItem = vi.fn<ItemRead>(over.readItem ?? (() => Promise.resolve(nothingRead)))
  const actions = stubActions()
  const bindProject = vi.fn<BindProjectWrite>(
    over.bindProject ?? (async () => Promise.resolve({ ok: true, value: planScreenModel(atlasPlan()) })),
  )
  render(
    <Routed
      actions={actions}
      at={AT}
      bindProject={bindProject}
      bridge={null}
      controls={over.controls ?? ADMIN_CONTROLS}
      own={stubPlanWrites()}
      plan={planScreenModel(over.plan ?? atlasPlan())}
      readItem={readItem}
      seats={seatDoubles()}
      surface={over.surface ?? { kind: 'admin', planId: PLAN_A }}
      zoom="item"
    />,
  )
  return { actions, bindProject, readItem, user: userEvent.setup() }
}

const seat = (token: string, role: 'view' | 'write' | 'manage'): Opened => ({
  surface: { kind: 'seat', token },
  controls: planCapabilities(role, { kind: 'plan', planId: PLAN_A }),
})

const meta = (): string => document.querySelector('[data-slot="panel-meta"]')?.textContent ?? ''

const reading = (): string => document.querySelector('[data-slot="estimate-reading"]')?.textContent ?? ''

const sprintValue = (): string =>
  document.querySelector('[data-slot="sprint-field"] button[aria-expanded]')?.textContent ?? ''

const sprintPill = (): string => document.querySelector('[data-slot="sprint-pill"]')?.textContent ?? ''

const closeLink = (): HTMLElement => screen.getByRole('link', { name: 'Close' })

const dockOf = (): Element | null => document.querySelector('[data-slot="drawer-shell"]')

const tabOf = (): Element | null => document.querySelector('[data-slot="panel-tab"]')

const gone = (): boolean => document.querySelector('[data-slot="drawer-not-found"]')?.textContent === GONE

const estimated = (days: number): StoredPlan =>
  atlasPlan({ features: atlasPlan().features.map((one) => (one.id === FEATURE_1 ? { ...one, estimateDays: days } : one)) })

/** Lets every settled promise run its callbacks, so a read that has answered has been drawn. */
const settled = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('the plan screen made a request'))))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('the drawer one feature is open in', () => {
  it('names the feature the address names as its subject, and every other one only as a candidate', () => {
    open(featurePath(PLAN_A, FEATURE_1))
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Billing' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Billing' })).toBeTruthy()
  })

  it('says the same words the table row says about it, rather than wording them again', () => {
    open(featurePath(PLAN_A, FEATURE_1))
    expect(meta()).toContain('Platform')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe('5')
    expect(sprintValue()).toContain('S1')
  })

  it('states the gap between what was authored and what was broken down, in the row’s own words', () => {
    open(featurePath(PLAN_A, FEATURE_1), { plan: estimated(40) })
    expect(reading()).toBe('planned 40d · broken down to 5d · -35d')
  })

  it('puts the authored estimate in the field while the list keeps the schedule’s sentence', () => {
    open(featurePath(PLAN_A, FEATURE_1), { plan: estimated(40) })
    expect(reading()).toBe('planned 40d · broken down to 5d · -35d')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe('40')
  })

  it('says why a feature has no sprint at all, which is a sentence and not a number', () => {
    open(featurePath(PLAN_A, FEATURE_2), { plan: unplacedPlan('in-cycle') })
    expect(sprintValue()).toContain('not placed')
    expect(document.querySelector('[data-slot="drawer-panel"]')?.textContent ?? document.body.textContent).toContain(
      'dependency cycle',
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Billing' })).toBeTruthy()
  })

  it('opens the plan’s second feature at its own address, so a selection can be linked to', () => {
    open(featurePath(PLAN_A, FEATURE_2))
    expect(screen.getByRole('heading', { level: 2, name: 'Billing' })).toBeTruthy()
  })

  it('names the rail the canvas draws for a feature no epic claims, rather than refusing it', () => {
    open(featurePath(PLAN_A, FEATURE_1), { plan: atlasPlan({ epics: [] }) })
    expect(meta()).toContain('Unclaimed rail')
  })

  it('draws the two fields an admin may write, seeded from the record rather than from the words', () => {
    open(featurePath(PLAN_A, FEATURE_1))
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Feature name' }).value).toBe('Auth rewrite')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe('5')
  })

  it('draws no description box and reads nothing, a feature having no file of its own to read', () => {
    const { readItem } = open(featurePath(PLAN_A, FEATURE_1))
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(readItem).not.toHaveBeenCalled()
  })

  it('closes back to the plan’s own address, which is the same address with nothing selected', () => {
    open(featurePath(PLAN_A, FEATURE_1))
    expect(closeLink().getAttribute('href')).toBe(planPath(PLAN_A))
  })
})

describe('the drawer one item is open in', () => {
  it('names the item the address names, and not the feature it flows under', () => {
    open(itemPath(PLAN_A, ITEM_1))
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Auth rewrite' })).toBeNull()
  })

  it('says which feature it flows under, which is the context a bare item name lacks', () => {
    open(itemPath(PLAN_A, ITEM_1))
    expect(meta()).toContain('Auth rewrite')
    expect(document.querySelector('[data-slot="place-picker"]')?.textContent).toContain('Auth rewrite')
  })

  it('says the same words the table row says about it, rather than wording them again', () => {
    open(itemPath(PLAN_A, ITEM_1))
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe('3')
    expect(sprintPill()).toContain('S1')
  })

  it('says why an item has no sprint at all, in the sentence the row picked for its treatment', () => {
    open(itemPath(PLAN_A, ITEM_3), { plan: unplacedPlan('in-cycle') })
    expect(screen.getByRole('heading', { level: 2, name: 'Invoices' })).toBeTruthy()
    expect(sprintPill()).toContain('not placed · in a dependency cycle')
  })

  it('opens another feature’s item at its own address', () => {
    open(itemPath(PLAN_A, ITEM_3))
    expect(screen.getByRole('heading', { level: 2, name: 'Invoices' })).toBeTruthy()
    expect(meta()).toContain('Billing')
  })

  it('draws the name and estimate fields from the record, an item’s own writes behind them', () => {
    open(itemPath(PLAN_A, ITEM_1))
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Item name' }).value).toBe('Sessions')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe('3')
  })

  it('closes back to the plan’s own address, which is the same address with nothing selected', () => {
    open(itemPath(PLAN_A, ITEM_1))
    expect(closeLink().getAttribute('href')).toBe(planPath(PLAN_A))
  })
})

// The one thing the plan does not carry. It was read by the item drawer's own page on the server, on
// every open, before the panel could be drawn; now the panel is drawn from the plan at once and only the
// description field waits for this read (ADR 0069).
describe('what an item’s drawer reads, and when', () => {
  it('reads the item’s description and its rail’s tasks once, naming the rail the item sits under', async () => {
    const { readItem } = open(itemPath(PLAN_A, ITEM_1))
    await settled()
    expect(readItem.mock.calls).toEqual([[PLAN_A, ITEM_1, EPIC_1]])
  })

  it('draws the panel before the read has answered, only the description waiting for it', () => {
    open(itemPath(PLAN_A, ITEM_1), { readItem: () => new Promise(() => undefined) })
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Item name' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
  })

  it('draws the box with the text the item’s own file holds, once it has been read', async () => {
    open(itemPath(PLAN_A, ITEM_1), {
      readItem: () => Promise.resolve({ ok: true, value: { description: 'Ship behind a flag', tasks: null } }),
    })
    expect((await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Description' })).value).toBe(
      'Ship behind a flag',
    )
  })

  it('draws an empty box for an item nobody has described, which the API answers as empty text', async () => {
    open(itemPath(PLAN_A, ITEM_1))
    expect((await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Description' })).value).toBe('')
    expect(screen.getByText('8192 of 8192 bytes left')).toBeTruthy()
  })

  it('draws no box at all when the read was refused, rather than one over text nobody saw', async () => {
    const { readItem } = open(itemPath(PLAN_A, ITEM_1), {
      readItem: () => Promise.resolve({ ok: false, status: 403, detail: 'Not permitted' }),
    })
    await settled()
    expect(readItem).toHaveBeenCalledOnce()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeTruthy()
  })

  it('keeps the panel on screen when the read never answers at all', async () => {
    open(itemPath(PLAN_A, ITEM_1), { readItem: () => Promise.reject(new TypeError('Failed to fetch')) })
    await settled()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeTruthy()
  })

  it('reads once per item opened, and not again for an edit made in the drawer', async () => {
    const { readItem, user } = open(itemPath(PLAN_A, ITEM_1))
    await settled()
    const name = screen.getByRole('textbox', { name: 'Item name' })
    await user.clear(name)
    await user.type(name, 'Sessions v2{Enter}')
    await settled()
    expect(readItem).toHaveBeenCalledOnce()
  })
})

describe('an address that names nothing the plan holds', () => {
  it('says so in the drawer for a feature this plan does not hold, rather than drawing an empty panel', () => {
    open(featurePath(PLAN_A, FEATURE_GONE))
    expect(gone()).toBe(true)
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('says so for an item id in the feature segment, the two segments not answering for each other', () => {
    open(featurePath(PLAN_A, ITEM_1))
    expect(gone()).toBe(true)
  })

  it('says so for an item this plan does not hold, and reads nothing for it', async () => {
    const { readItem } = open(itemPath(PLAN_A, NO_SUCH_ITEM))
    await settled()
    expect(gone()).toBe(true)
    expect(readItem).toHaveBeenCalledOnce()
  })

  it('says so for a feature id in the item segment', () => {
    open(itemPath(PLAN_A, FEATURE_1))
    expect(gone()).toBe(true)
  })

  it('says so for an item whose feature the plan no longer holds, having nothing to place it in', () => {
    open(itemPath(PLAN_A, ITEM_1), { plan: atlasPlan({ features: [] }) })
    expect(atlasPlan().items.some((one) => one.id === ITEM_1)).toBe(true)
    expect(gone()).toBe(true)
  })

  it('says so for a rail and a group the plan does not hold', () => {
    open(railPath(PLAN_A, NO_SUCH_RAIL))
    expect(gone()).toBe(true)
    cleanup()
    open(groupPath(PLAN_A, LABEL_GONE))
    expect(gone()).toBe(true)
  })

  it('still draws the plan itself beside it, the address naming a drawer and not a page', () => {
    open(featurePath(PLAN_A, FEATURE_GONE))
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
  })
})

describe('moving between the plan’s own addresses asks the server nothing', () => {
  it('opens a feature from its row in the table, in the frame it was clicked in', async () => {
    const { readItem } = open(planPath(PLAN_A))
    const row = await vi.waitFor(() => {
      const found = document.querySelector(`[data-testid="row-${FEATURE_1}"] [data-slot="row-actions"] a`)
      if (found === null) throw new Error('the table has not mounted yet')
      return found
    })
    fireEvent.click(row)
    expect(window.location.pathname).toBe(featurePath(PLAN_A, FEATURE_1))
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(readItem).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('closes back to the plan’s own address in the same frame, the plan staying on screen', () => {
    open(featurePath(PLAN_A, FEATURE_1))
    fireEvent.click(closeLink())
    expect(window.location.pathname).toBe(planPath(PLAN_A))
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('draws an edit made in the drawer on the board at once, before its write has answered', async () => {
    const { actions, user } = open(featurePath(PLAN_A, FEATURE_1))
    vi.mocked(actions.renameFeature).mockImplementation(() => new Promise(() => undefined))
    const name = screen.getByRole('textbox', { name: 'Feature name' })
    await user.clear(name)
    await user.type(name, 'Auth rewrite II{Enter}')
    expect(actions.renameFeature).toHaveBeenCalledWith(PLAN_A, FEATURE_1, 'Auth rewrite II')
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite II' })).toBeTruthy()
    expect(screen.getAllByRole('rowheader', { name: 'Auth rewrite II' }).length).toBeGreaterThan(0)
  })
})

// The four form drawers draw in a `DrawerShell`, and the old form-drawer test was the one that held the
// shell's own contract; it is held here now, against the drawers that use it.
describe('the form drawers, and the panel they open in', () => {
  it.each([
    ['a new rail', PLAN_DRAWERS.newRail(PLAN_A, 2), 'Add a rail'],
    ['a new group', PLAN_DRAWERS.newGroup(PLAN_A), 'Add a group'],
    ['one rail', railPath(PLAN_A, EPIC_1), 'Platform'],
    ['one group', groupPath(PLAN_A, LABEL_1), 'Phase 1'],
  ])('draws %s in a panel tabbed %s, closing back to the plan', (_what, path, title) => {
    open(path)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(title)
    expect(dockOf()).toBeTruthy()
    expect(closeLink().getAttribute('href')).toBe(planPath(PLAN_A))
    expect(tabOf()?.contains(closeLink())).toBe(true)
  })

  it('puts the way out in the tab beside the name, and not under the fields', () => {
    open(railPath(PLAN_A, EPIC_1))
    expect(closeLink().textContent).toBe(String.fromCharCode(0x2715))
    expect(tabOf()?.querySelector('h2')?.textContent).toBe('Platform')
    expect(tabOf()?.querySelector('input')).toBeNull()
  })

  it('scrolls the fields under that strip rather than the panel, so a long form cannot push it away', () => {
    open(railPath(PLAN_A, EPIC_1))
    const pane = dockOf()?.lastElementChild
    expect(pane?.querySelector('input')).toBeTruthy()
    expect(pane?.className).toContain('overflow-y-auto')
    expect(dockOf()?.className).not.toContain('overflow-y-auto')
  })

  it('dims nothing and covers nothing, the board above it merely being shorter', () => {
    open(PLAN_DRAWERS.newRail(PLAN_A, 2))
    expect(dockOf()?.className).not.toContain('fixed')
    expect(dockOf()?.className).toContain('shrink-0')
    expect(screen.getAllByRole('link', { name: 'Close' })).toHaveLength(1)
  })

  it('opens at its own height, and offers a grip a keyboard can reach', () => {
    open(PLAN_DRAWERS.newRail(PLAN_A, 2))
    expect(dockOf()?.getAttribute('style')).toContain('var(--plan-panel, 360px)')
    expect(screen.getByRole('button', { name: /resize the panel/ })).toBeTruthy()
  })

  it('is an aside named by its own heading, and claims no dialog role', () => {
    open(groupPath(PLAN_A, LABEL_1))
    const dock = dockOf()
    expect(dock?.tagName).toBe('ASIDE')
    expect(dock?.getAttribute('aria-labelledby')).toBe(dock?.querySelector('h2')?.id)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('the rail drawer, which is where a binding lives', () => {
  it('says the rail is bound to nothing yet, and offers naming the project before pasting a token', () => {
    open(railPath(PLAN_A, EPIC_1))
    expect(screen.getByText(/not bound to a Microtask project/)).toBeTruthy()
    const labels = [...document.querySelectorAll('p')].map((one) => one.textContent ?? '')
    const byProject = labels.findIndex((one) => one.startsWith('Bind to a project'))
    expect(byProject).toBeGreaterThan(-1)
    expect(byProject).toBeLessThan(labels.findIndex((one) => one.startsWith('Or paste a token')))
  })

  // A rail's name is committed when the box is left, as it always was (`../rails/rail-fields.tsx`).
  it('renames the rail on the board the moment the name is committed', async () => {
    const { actions, user } = open(railPath(PLAN_A, EPIC_1))
    vi.mocked(actions.renameEpic).mockImplementation(() => new Promise(() => undefined))
    const name = screen.getByRole('textbox', { name: 'Name of Platform' })
    await user.clear(name)
    await user.type(name, 'Core')
    await user.tab()
    expect(actions.renameEpic).toHaveBeenCalledWith(PLAN_A, EPIC_1, 'Core')
    expect(document.querySelector('[data-slot="rail-names"]')?.textContent).toContain('Core')
  })
})

describe('the group drawer', () => {
  it('names the group, counts what is in it, and lists every feature as a member to tick', () => {
    open(groupPath(PLAN_A, LABEL_1))
    expect(screen.getByText(/in this group/)).toBeTruthy()
    const boxes = document.querySelectorAll('[data-slot="group-members"] input[type="checkbox"]')
    expect(boxes.length).toBe(atlasPlan().features.length)
  })
})

describe('the drawers a seat opens', () => {
  it('draws a feature’s panel for a seat, closing back to the seat’s own page and never an admin path', () => {
    open(`${linkPath(MANAGE_SEAT_TOKEN)}/f/${FEATURE_1}`, seat(MANAGE_SEAT_TOKEN, 'manage'))
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(closeLink().getAttribute('href')).toBe(linkPath(MANAGE_SEAT_TOKEN))
  })

  it('draws the fields a manage seat may write, and none at all for a view seat', () => {
    open(`${linkPath(MANAGE_SEAT_TOKEN)}/f/${FEATURE_1}`, seat(MANAGE_SEAT_TOKEN, 'manage'))
    expect(screen.getByRole('textbox', { name: 'Feature name' })).toBeTruthy()
    cleanup()
    open(`${linkPath(SEAT_TOKEN)}/f/${FEATURE_1}`, seat(SEAT_TOKEN, 'view'))
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Feature name' })).toBeNull()
  })

  // The link field says the rail is bound to nothing here, the bridge having answered nothing: which is
  // the field drawn, and the sentence is how a test that cannot see a binding knows it is there.
  it('reads an item’s description through the seat’s own read, and offers a manage seat its link', async () => {
    const { readItem } = open(`${linkPath(MANAGE_SEAT_TOKEN)}/i/${ITEM_1}`, seat(MANAGE_SEAT_TOKEN, 'manage'))
    await settled()
    expect(readItem.mock.calls).toEqual([[PLAN_A, ITEM_1, EPIC_1]])
    expect(screen.getByText(LINK_WORDS.unbound)).toBeTruthy()
  })

  it('draws no link field at all for a view seat', () => {
    open(`${linkPath(SEAT_TOKEN)}/i/${ITEM_1}`, seat(SEAT_TOKEN, 'view'))
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeTruthy()
    expect(screen.queryByText(LINK_WORDS.unbound)).toBeNull()
  })

  it('opens no rail, group or add drawer on a seat, which had no routes for them', () => {
    for (const tail of [`r/${EPIC_1}`, `g/${LABEL_1}`, 'new/rail', 'new/group']) {
      open(`${linkPath(MANAGE_SEAT_TOKEN)}/${tail}`, seat(MANAGE_SEAT_TOKEN, 'manage'))
      expect(dockOf(), tail).toBeNull()
      expect(screen.queryByRole('heading', { level: 2 }), tail).toBeNull()
      cleanup()
    }
  })

  it('never opens a drawer at an admin address on a seat, the seat’s root being its token', () => {
    open(featurePath(PLAN_A, FEATURE_1), seat(MANAGE_SEAT_TOKEN, 'manage'))
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })
})

// Opened before its create was answered, the drawer names a placeholder the API never issued; the store
// learns the real id from the answer (`../store/plan-store.ts`), and the drawer follows it.
describe('a drawer opened on something created a moment ago', () => {
  const answeredWith = (): PlanScreenModel => ({
    ...addItem(planScreenModel(atlasPlan()), { featureId: FEATURE_1, name: 'Audit trail' }, 'REAL_ITEM'),
    updatedAt: '2026-10-04T00:00:00.000Z',
  })

  const openedOnNewItem = async () => {
    const opened = open(featurePath(PLAN_A, FEATURE_1))
    const answer: { to: (answered: ActionResult<PlanScreenModel>) => void } = { to: () => undefined }
    vi.mocked(opened.actions.createItem).mockImplementation(() => new Promise((resolve) => (answer.to = resolve)))
    await opened.user.type(screen.getByRole('textbox', { name: ITEM_ADD_WORDS.label }), 'Audit trail{Enter}')
    await opened.user.click(screen.getByRole('link', { name: 'Audit trail' }))
    return { ...opened, answer }
  }

  it('stays open on the same panel when the create is answered, and moves to the real address', async () => {
    const { answer } = await openedOnNewItem()
    expect(window.location.pathname).toMatch(/\/i\/pending%3A\d+$/)
    const field = screen.getByRole('textbox', { name: 'Item name' })
    await act(async () => {
      answer.to({ ok: true, value: answeredWith() })
      await Promise.resolve()
    })
    await settled()
    expect(gone()).toBe(false)
    expect(window.location.pathname).toBe(itemPath(PLAN_A, 'REAL_ITEM'))
    expect(new URLSearchParams(window.location.search).get('open')).toBe(`f:${FEATURE_1},i:REAL_ITEM`)
    expect(screen.getByRole('textbox', { name: 'Item name' })).toBe(field)
  })

  it('sends a rename made there before the answer under the id the create was answered with', async () => {
    const { actions, answer, user } = await openedOnNewItem()
    const field = screen.getByRole('textbox', { name: 'Item name' })
    await user.clear(field)
    await user.type(field, 'Audit log')
    await user.tab()
    await act(async () => {
      answer.to({ ok: true, value: answeredWith() })
      await Promise.resolve()
    })
    await settled()
    expect(actions.renameItem).toHaveBeenCalledWith(PLAN_A, 'REAL_ITEM', 'Audit log')
    expect(gone()).toBe(false)
  })
})

// The subject leaves the plan the moment a delete is confirmed, and its drawer closes then; the answer
// lands later, behind every write queued before it, and must move nothing the reader opened meanwhile.
describe('a delete, whose drawer closes the moment it is confirmed', () => {
  // The first link to a feature is its bar on the canvas, an SVG anchor, which is what a reader clicks.
  const linkTo = async (href: string): Promise<Element> =>
    vi.waitFor(() => {
      const found = document.querySelector(`a[href^="${href}"]`)
      if (found === null) throw new Error(`nothing on the screen links to ${href}`)
      return found
    })

  const deleted = async (user: ReturnType<typeof open>['user']) => {
    await user.click(screen.getByTitle('Delete feature'))
    await user.click(screen.getByRole('button', { name: 'Delete feature' }))
  }

  it('closes at once, and an answer landing after another drawer was opened moves nothing', async () => {
    const { actions, user } = open(featurePath(PLAN_A, FEATURE_1))
    const answer: { to: (answered: ActionResult<PlanScreenModel>) => void } = { to: () => undefined }
    vi.mocked(actions.removeFeature).mockImplementation(() => new Promise((resolve) => (answer.to = resolve)))
    await deleted(user)
    expect(window.location.pathname).toBe(planPath(PLAN_A))
    await user.click(await linkTo(featurePath(PLAN_A, FEATURE_2)))
    await act(async () => {
      answer.to({ ok: true, value: planScreenModel(atlasPlan()) })
      await Promise.resolve()
    })
    await settled()
    expect(window.location.pathname).toBe(featurePath(PLAN_A, FEATURE_2))
    expect(gone()).toBe(false)
  })

  it('puts a refused delete’s subject back on the plan, and the screen’s notice says why', async () => {
    const { actions, user } = open(featurePath(PLAN_A, FEATURE_1))
    vi.mocked(actions.removeFeature).mockResolvedValue({ ok: false, status: 403, detail: 'Not permitted: feature:delete' })
    await deleted(user)
    await settled()
    expect(window.location.pathname).toBe(planPath(PLAN_A))
    expect(document.querySelector('[data-slot="plan-notice"]')?.textContent).toContain('Not permitted: feature:delete')
    expect(await linkTo(featurePath(PLAN_A, FEATURE_1))).toBeTruthy()
  })
})

// The rail drawer opens on a rail the moment it is made, and binding it is a write of its own outside the
// plan's: it waits behind the rail's create, and goes out under the id that create was answered with.
describe('a rail bound to a project before its create was answered', () => {
  it('sends the binding under the rail’s real id, once the create has been answered', async () => {
    const { actions, bindProject, user } = open(PLAN_DRAWERS.newRail(PLAN_A, 1))
    const answer: { to: (answered: ActionResult<PlanScreenModel>) => void } = { to: () => undefined }
    vi.mocked(actions.createEpic).mockImplementation(() => new Promise((resolve) => (answer.to = resolve)))
    await user.type(screen.getByRole('textbox', { name: NEW_RAIL_WORDS.label }), 'Ops')
    await user.click(screen.getByRole('button', { name: NEW_RAIL_WORDS.action }))
    const rail = document.querySelector(`a[href^="${planPath(PLAN_A)}/r/pending"]`)
    if (rail === null) throw new Error('the new rail has no link to its drawer')
    await user.click(rail)
    await user.type(screen.getByRole('textbox', { name: 'Microtask project to bind this rail to' }), 'prj_1')
    await user.click(screen.getByRole('button', { name: 'Bind project' }))
    expect(bindProject).not.toHaveBeenCalled()
    await act(async () => {
      answer.to({ ok: true, value: { ...addRail(planScreenModel(atlasPlan()), { name: 'Ops' }, 'REAL_RAIL'), updatedAt: '2026-10-04T00:00:00.000Z' } })
      await Promise.resolve()
    })
    await settled()
    expect(bindProject).toHaveBeenCalledWith(PLAN_A, 'REAL_RAIL', { projectId: 'prj_1', role: 'view' })
  })
})

// The table's row actions link to a feature's drawer at the control that does the thing
// (`../table/row-actions.tsx`): Add item at the field that adds one, Delete at the delete.
describe('the controls the table’s row actions land on', () => {
  it('gives the field that adds an item the id the Add item link names', () => {
    open(featurePath(PLAN_A, FEATURE_1))
    expect(document.getElementById(ADD_ANCHOR)).toBe(screen.getByRole('textbox', { name: ITEM_ADD_WORDS.label }))
  })

  it('gives the delete the id the Delete link names', () => {
    open(featurePath(PLAN_A, FEATURE_1))
    expect(document.getElementById(DELETE_ANCHOR)?.contains(screen.getByTitle('Delete feature'))).toBe(true)
  })
})
