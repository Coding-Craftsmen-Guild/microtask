import type { Rung } from '@repo/canvas'
import type { ScopeValue } from '@repo/contracts'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ADMIN_CONTROLS } from '../../lib/admin-controls'
import { ADMIN_DRAWER_ROUTES } from '../../lib/drawer-routes'
import { planCapabilities, type PlanControls } from '../../lib/plan-capabilities'
import type { PlanEditActions } from './edit-actions'
import { axisX } from './canvas/view'
import { LIT_SLOTS, POINTER_CSS } from './canvas/pointer-css'
import { planAxis } from './canvas/zoom-view'
import { PlanScreen } from './plan-screen'
import { planScreenModel } from './plan-screen-model'
import { PLAN_ROOT } from './shell/shell-css'
import { PlanSidebar } from './sidebar/plan-sidebar'
import { NOTHING_SELECTED_ID } from './sidebar/select-css'
import { sidebarRails } from './sidebar/sidebar-rows'
import { atlasPlan, FEATURE_1, ITEM_1, PLAN_A, unplacedPlan } from './testing/plan-fixture'
import { stubActions } from './testing/plan-writes'
import { VIEW_SWITCH_CSS } from './view-switch'

// The pointer root calls `useRouter`, which throws outside an App Router tree. What it is called with
// is asserted where the gesture lives (`./canvas/plan-pointer.test.tsx`); here it only has to exist.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
}))

const AT = new Date('2026-10-05T09:00:00.000Z')

const SEAT: ScopeValue = { kind: 'plan', planId: PLAN_A }

// Markers rather than the real components: what is asserted below is where the screen puts whatever
// fills a slot and whether it draws anything when nothing does, and a real panel would make those
// two facts depend on a second component's markup.
const MARKER: ReactNode = <p data-testid="drawer-marker">whatever is open</p>

const MANAGE: ReactNode = <p data-testid="manage-marker">who else may open this plan</p>

const TRAY: ReactNode = <p data-testid="tray-marker">what has no bar</p>

interface Shown {
  readonly controls?: PlanControls
  readonly drawer?: ReactNode
  readonly manage?: ReactNode
  readonly actions?: PlanEditActions | null
  readonly tray?: ReactNode
  readonly sidebar?: ReactNode

  readonly zoom?: Rung
}

const show = (over: Shown = {}) =>
  render(
    <PlanScreen
      actions={over.actions ?? null}
      at={AT}
      controls={over.controls ?? ADMIN_CONTROLS}
      drawer={over.drawer ?? null}
      groups={null}
      manage={over.manage ?? null}
      plan={planScreenModel(atlasPlan())}
      progress={[]}
      root={PLAN_A}
      routes={ADMIN_DRAWER_ROUTES}
      sidebar={over.sidebar ?? null}
      tray={over.tray ?? null}
      zoom={over.zoom ?? 'feature'}
      zoomControl={null}
      newRailHref="/plans/p/new/rail?n=1"
      zoomTo={null}
    />,
  )

const dragging = (container: HTMLElement): string | null =>
  container.querySelector('[data-slot="drag-root"]')?.getAttribute('data-drag') ?? null

const shell = (): Element => {
  const found = document.querySelector('[data-slot="plan-shell"]')
  if (found === null) throw new Error('the screen rendered no shell')
  return found
}

const slot = (name: string): Element | null => document.querySelector(`[data-slot="${name}"]`)

const viewRadios = (): readonly HTMLInputElement[] => [
  ...document.querySelectorAll<HTMLInputElement>('input[name="plan-view"]'),
]

const radio = (name: string): HTMLInputElement => {
  const found = screen.getByRole('radio', { name })
  if (!(found instanceof HTMLInputElement)) throw new Error(`${name} is not an input`)
  return found
}

const before = (first: Element, second: Element): boolean =>
  (first.compareDocumentPosition(second) & first.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('the two renderings one plan screen holds', () => {
  it('mounts the canvas and the table at once, so neither is a view to be switched to', () => {
    show()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Table of Atlas rollout' })).toBeTruthy()
  })

  it('names every feature and item in the table while the timeline is the selected view', () => {
    show()
    expect(radio('Timeline').checked).toBe(true)
    expect(screen.getByTestId(`row-${FEATURE_1}`)).toBeTruthy()
    expect(screen.getByTestId(`row-${ITEM_1}`)).toBeTruthy()
  })

  it('still heads the page with the plan’s name as a real heading', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Atlas rollout' })).toBeTruthy()
  })
})

describe('the switch between them', () => {
  it('offers the choice as one native radio group, so the screen needs no JavaScript to switch', () => {
    show()
    expect(radio('Timeline').getAttribute('name')).toBe('plan-view')
    expect(radio('Table').getAttribute('name')).toBe(radio('Timeline').getAttribute('name'))
    expect(viewRadios()).toHaveLength(2)
  })

  it('describes the choice on both radios, rather than claiming a group the markup is not', () => {
    show()
    expect(document.getElementById('plan-view-hint')?.textContent).toContain(
      'which rendering of this plan is on screen',
    )
    for (const one of viewRadios()) {
      expect(one.getAttribute('aria-describedby')).toBe('plan-view-hint')
    }
    expect(document.querySelectorAll('fieldset, [role="radiogroup"]')).toHaveLength(0)
  })

  it('starts on the timeline, which is the rendering §5 makes this product’s own', () => {
    show()
    expect(radio('Timeline').checked).toBe(true)
    expect(radio('Table').checked).toBe(false)
  })

  // The condition is on the shell, not on a sibling, which is what lets the tabs live in the toolbar
  // strip and the panels two regions down. A `peer-` variant is a sibling selector and could not.
  it('governs both panels from a rule anchored on the shell, not from a sibling selector', () => {
    show()
    expect(document.querySelector('style')?.textContent).toBe(VIEW_SWITCH_CSS)
    expect(VIEW_SWITCH_CSS).toContain('[data-slot="plan-shell"]:has(#plan-view-table:checked)')
    expect(slot('timeline-panel')).toBeTruthy()
    expect(slot('table-panel')).toBeTruthy()
  })

  it('puts the tabs in the toolbar and the panels outside it, which is the point of the rule', () => {
    show()
    const tabs = slot('view-tabs')
    expect(tabs?.contains(radio('Timeline'))).toBe(true)
    expect(tabs?.contains(slot('timeline-panel'))).toBe(false)
  })

  it('hides the unchosen canvas outright, which costs a reader one img label', () => {
    expect(VIEW_SWITCH_CSS).toContain('[data-slot="timeline-panel"]{display:none}')
  })

  // The one thing about the first revision's switch that was right, and kept: the table is the
  // accessible rendering of this plan, so it is taken off screen rather than removed.
  it('never hides the table, only takes it off screen, so it never leaves the accessibility tree', () => {
    expect(VIEW_SWITCH_CSS).toContain('position:absolute;width:1px;height:1px')
    expect(VIEW_SWITCH_CSS).not.toContain('[data-slot="table-panel"]{display:none}')
  })

  it('carries the switch on inputs the browser owns, so nothing here needs a state hook', () => {
    show()
    expect(viewRadios().map((one) => one.getAttribute('id'))).toEqual([
      'plan-view-timeline',
      'plan-view-table',
    ])
  })
})

describe('the frame the regions sit in', () => {
  it('fills its parent and lets each pane scroll, so the board is on screen without scrolling', () => {
    show()
    const classes = shell().getAttribute('class') ?? ''
    expect(classes).toContain('h-full')
    expect(classes).toContain('min-h-0')
  })

  it('draws the head, the toolbar and the body in that order, the plan’s name coming first', () => {
    show()
    const heading = screen.getByRole('heading', { level: 1, name: 'Atlas rollout' })
    expect(before(heading, radio('Timeline'))).toBe(true)
    expect(before(radio('Timeline'), slot('plan-board') as Element)).toBe(true)
  })

  it('omits the sidebar pane entirely where a surface passes none, rather than an empty column', () => {
    show()
    expect(slot('plan-side')).toBeNull()
    expect(slot('plan-main')).toBeTruthy()
  })

  // The defect this frame replaced, and the one no test could see. The split was
  // `lg:grid-cols-[17rem_minmax(0,1fr)]` and the seat surface passed no sidebar; a null child renders
  // nothing at all rather than an empty box, so the board became the FIRST grid item and drew itself
  // into the 17rem names track — a 272px timeline on a 1545px page, with the wide column beside it
  // empty. happy-dom computes no layout, so the only way to pin it is structurally: the board is in
  // the main pane, and it is in the main pane whether or not there is a sidebar beside it.
  it('draws the board in the main pane and never in the sidebar’s, with a sidebar beside it', () => {
    render(
      <PlanScreen
        actions={null}
        at={AT}
        controls={ADMIN_CONTROLS}
        drawer={null}
        groups={null}
        manage={null}
        plan={planScreenModel(atlasPlan())}
        progress={[]}
        root={PLAN_A}
        routes={ADMIN_DRAWER_ROUTES}
        sidebar={<p data-testid="side-marker">the tree</p>}
        tray={null}
        zoom="feature"
        zoomControl={null}
        newRailHref="/plans/p/new/rail?n=1"
        zoomTo={null}
      />,
    )
    const board = slot('plan-board')
    expect(board).toBeTruthy()
    expect(slot('plan-main')?.contains(board as Node)).toBe(true)
    expect(slot('plan-side')?.contains(board as Node)).toBe(false)
    expect(slot('plan-side')?.contains(screen.getByTestId('side-marker'))).toBe(true)
  })

  it('draws the board in the main pane with no sidebar at all, which is the seat surface', () => {
    show()
    expect(slot('plan-main')?.contains(slot('plan-board') as Node)).toBe(true)
  })
})

describe('the slot whatever is open beside the plan fills', () => {
  it('adds nothing to the screen where there is no drawer, rather than an empty container', () => {
    show()
    expect(screen.queryByTestId('drawer-marker')).toBeNull()
  })

  it('draws it last and outside both scrolling panes, the drawer being positioned against the page', () => {
    show({ drawer: MARKER })
    const marker = screen.getByTestId('drawer-marker')
    expect(marker.parentElement).toBe(shell())
    expect(slot('plan-main')?.contains(marker)).toBe(false)
  })
})

describe('the slot the whole-plan actions fill', () => {
  it('adds nothing where a surface offers none, rather than an empty row', () => {
    show()
    expect(screen.queryByTestId('manage-marker')).toBeNull()
  })

  it('puts them in the head beside the plan’s name, where sharing a plan belongs', () => {
    show({ manage: MANAGE })
    const marker = screen.getByTestId('manage-marker')
    expect(slot('plan-head')?.contains(marker)).toBe(true)
  })
})

describe('the slot the features with no bar fill', () => {
  it('adds nothing where everything is placed, rather than an empty panel', () => {
    show()
    expect(screen.queryByTestId('tray-marker')).toBeNull()
  })

  // Under the board and inside its panel: a table row for an unplaced feature is already in the
  // table with its dates empty, so repeating it under the table would be the duplication this
  // revision set out to remove.
  it('puts it under the board and inside the timeline panel, never under the table', () => {
    show({ tray: TRAY })
    const marker = screen.getByTestId('tray-marker')
    expect(slot('timeline-panel')?.contains(marker)).toBe(true)
    expect(slot('table-panel')?.contains(marker)).toBe(false)
    expect(before(slot('plan-board') as Element, marker)).toBe(true)
  })
})

describe('the count of what wants looking at', () => {
  it('says nothing at all about a plan with nothing wrong', () => {
    show()
    expect(slot('attention-chip')).toBeNull()
  })

  it('counts the entities of a plan that has some, beside the plan’s calendar', () => {
    render(
      <PlanScreen
        actions={null}
        at={AT}
        controls={ADMIN_CONTROLS}
        drawer={null}
        groups={null}
        manage={null}
        plan={planScreenModel(unplacedPlan('no-estimate'))}
        progress={[]}
        root={PLAN_A}
        routes={ADMIN_DRAWER_ROUTES}
        sidebar={null}
        tray={null}
        zoom="feature"
        zoomControl={null}
        newRailHref="/plans/p/new/rail?n=1"
        zoomTo={null}
      />,
    )
    const chip = slot('attention-chip')
    expect(chip?.textContent).toMatch(/need(s)? attention/)
  })
})

describe('the controls the screen is handed', () => {
  it('draws the whole plan for the weakest seat there is, no control being load-bearing', () => {
    show({ controls: planCapabilities('view', SEAT) })
    expect(screen.getByRole('heading', { level: 1, name: 'Atlas rollout' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Table of Atlas rollout' })).toBeTruthy()
    expect(screen.getByTestId(`row-${FEATURE_1}`)).toBeTruthy()
    expect(screen.getByTestId(`row-${ITEM_1}`)).toBeTruthy()
  })

  // This read `expect(seat.innerHTML).toBe(admin.innerHTML)` until the table grew an actions column, and
  // the premise it was defending is unchanged: no *write* is load-bearing, so a surface handed none draws
  // the whole plan. What has changed is that a row now offers links into the controls a viewer may use,
  // and which links those are is a question about the **viewer** rather than about the writes. So the
  // picture is still compared whole, and the one thing that may legitimately differ is asserted below it.
  it('draws the same plan for the admin and for a view seat while it is handed no write at all', () => {
    const { container: admin } = show()
    const { container: seat } = show({ controls: planCapabilities('view', SEAT) })
    const canvas = (container: HTMLElement): string =>
      container.querySelector('[data-slot="plan-canvas"]')?.innerHTML ?? ''
    expect(canvas(seat)).toBe(canvas(admin))
    expect(canvas(admin)).not.toBe('')
    expect(dragging(admin)).toBe('false')
  })

  it('offers a view seat no row actions at all, rather than links to controls that would refuse it', () => {
    const actions = (container: HTMLElement): number =>
      container.querySelectorAll('[data-slot="row-actions"]').length
    expect(actions(show().container)).toBeGreaterThan(0)
    expect(actions(show({ controls: planCapabilities('view', SEAT) }).container)).toBe(0)
  })

  it('listens for a drag once it holds the writes, and not for a seat that may not place', () => {
    const actions = stubActions()
    expect(dragging(show({ actions }).container)).toBe('true')
    const seat = show({ actions, controls: planCapabilities('view', SEAT) })
    expect(dragging(seat.container)).toBe('false')
  })

  it('refuses the drag to a write seat and offers it to a manage seat, which is where feature:place sits', () => {
    const actions = stubActions()
    expect(dragging(show({ actions, controls: planCapabilities('write', SEAT) }).container)).toBe('false')
    expect(dragging(show({ actions, controls: planCapabilities('manage', SEAT) }).container)).toBe('true')
  })
})

// The two generated selection sheets — `labels/group-css.ts` for a group and `sidebar/select-css.ts`
// for a rail or a feature — are `:has()` rules anchored on one ancestor of both the radio and the
// marks. Every test of either asserted the rule's **text** and, separately, that the marks carry the
// attributes it names; none asserted that the element it anchors on is an element this screen
// renders. It was not: both sheets named `[data-slot="plan-root"]`, which nothing has rendered since
// the frame of ADR 0068 replaced the old root with `plan-shell`, so no rule in either sheet could
// ever match and neither selection dimmed anything in a browser. The unit tests all passed.
//
// So this is the case that holds the anchor and the markup together, and it is deliberately about
// containment rather than about equality of two constants, which would be a tautology: whatever the
// sheets anchor on must be an element that exists and must contain the marks the rules go on to
// select, or the `:has()` cannot reach them.
describe('the element both generated selection sheets anchor on', () => {
  it('is an element this screen renders, which is what makes a :has() rule able to match at all', () => {
    show()

    expect(document.querySelector(PLAN_ROOT)).not.toBeNull()
  })

  it('contains the radios the rules key on and the marks they dim, both being inside one ancestor', () => {
    show({ sidebar: <PlanSidebar actions={null} found={new Map()} rails={sidebarRails(planScreenModel(atlasPlan()))} root={PLAN_A} routes={ADMIN_DRAWER_ROUTES} /> })
    const root = document.querySelector(PLAN_ROOT)

    expect(root).not.toBeNull()

    expect(root?.querySelector(`#${NOTHING_SELECTED_ID}`)).not.toBeNull()
    expect(root?.querySelector('[data-slot="feature-bar"]')).not.toBeNull()
    expect(root?.querySelector('[data-slot="plan-table-row"]')).not.toBeNull()
  })

  it('is the shell itself, so the frame and the sheets cannot drift apart over a renamed slot', () => {
    show()

    expect(document.querySelector(PLAN_ROOT)).toBe(shell())
  })
})

// The same join the block above exists for, for the hover sheet: `POINTER_CSS` names five slots and
// paints nothing at all if the screen renders none of them, and a rule that matches nothing is valid
// CSS. So each slot it names is asserted to be something under the root that listens for the hover.
describe('the root that listens for a pointer over the plan', () => {
  it('wraps the whole screen, so a hover in the sidebar can reach a bar on the canvas', () => {
    show({ sidebar: <PlanSidebar actions={null} found={new Map()} rails={sidebarRails(planScreenModel(atlasPlan()))} root={PLAN_A} routes={ADMIN_DRAWER_ROUTES} /> })
    const root = document.querySelector('[data-slot="plan-pointer"]')

    expect(root).not.toBeNull()
    expect(root?.querySelector(PLAN_ROOT)).toBe(shell())
    expect(root?.querySelector('[data-slot="sidebar-row"][data-hover-id]')).not.toBeNull()
    expect(root?.querySelector('[data-slot="feature-bar"][data-hover-id]')).not.toBeNull()
  })

  it('mounts the sheet that paints a lit mark, every slot of which the screen renders', () => {
    // At the Sprint rung, which is the one that draws item ticks: a sheet naming a slot no rendering
    // produces is a rule that matches nothing, which is the defect this whole block exists to catch.
    show({ zoom: 'item', sidebar: <PlanSidebar actions={null} found={new Map()} rails={sidebarRails(planScreenModel(atlasPlan()))} root={PLAN_A} routes={ADMIN_DRAWER_ROUTES} /> })
    const sheets = [...document.querySelectorAll('style')].map((one) => one.textContent ?? '').join('')

    expect(sheets).toContain(POINTER_CSS)
    for (const slot of LIT_SLOTS) {
      expect(POINTER_CSS, slot).toContain(`[data-slot="${slot}"][data-lit]`)
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull()
    }
  })

  it('tells the root the scale the canvas was actually drawn at, so a zoom anchors where it looks', () => {
    show()
    const root = document.querySelector('[data-slot="plan-pointer"]')
    const axis = planAxis(planScreenModel(atlasPlan()), AT, 'feature')

    expect(root?.getAttribute('data-px-per-day')).toBe(String(axis.scale.pxPerDay))
    expect(root?.getAttribute('data-axis-x')).toBe(String(axisX(axis.scale, axis.range)))
  })
})
