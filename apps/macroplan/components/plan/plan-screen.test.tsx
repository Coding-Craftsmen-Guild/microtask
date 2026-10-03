import type { Rung } from '@repo/canvas'
import type { ScopeValue } from '@repo/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ADMIN_CONTROLS } from '../../lib/admin-controls'
import { ADMIN_DRAWER_ROUTES } from '../../lib/drawer-routes'
import { planCapabilities, type PlanControls } from '../../lib/plan-capabilities'
import type { PlanEditActions } from './edit-actions'
import { axisX } from './canvas/view'
import { LIT_SLOTS, POINTER_CSS } from './canvas/pointer-css'
import { planAxis } from './canvas/zoom-view'
import { PlanScreen, type PlanScreenProps } from './plan-screen'
import { planScreenModel, type PlanScreenModel } from './plan-screen-model'
import { PLAN_ROOT } from './shell/shell-css'
import { NOTHING_SELECTED_ID, railRadioId } from './board/rail-select-css'
import { GroupChips } from './labels/group-chips'
import { ALL_RADIO_ID, groupRadioId } from './labels/group-css'
import { allWorkFit } from './labels/group-fit'
import { labelRows } from './labels/label-rows'
import { atlasPlan, EPIC_1, FEATURE_1, ITEM_1, LABEL_1, PLAN_A, unplacedPlan } from './testing/plan-fixture'
import { stubActions } from './testing/plan-writes'
import type { PlanView } from './view-switch'

// The pointer root reads the open drawers off the query. What a click does with them is asserted where
// the gesture lives (`./canvas/plan-pointer.test.tsx`); here the query only has to exist.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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
  readonly groups?: ReactNode
  readonly controls?: PlanControls
  readonly drawer?: ReactNode
  readonly manage?: ReactNode
  readonly actions?: PlanEditActions | null
  readonly tray?: ReactNode
  readonly plan?: PlanScreenModel
  readonly zoom?: Rung
}

// The choice of view is the caller's state — `PlanApp` holds it — so the screen is rendered under a
// holder that keeps it the same way, and a click on a radio changes what is drawn exactly as it does there.
function Switching(props: Omit<PlanScreenProps, 'view' | 'onView'>) {
  const [view, setView] = useState<PlanView>('timeline')
  return <PlanScreen {...props} onView={setView} view={view} />
}

const show = (over: Shown = {}) =>
  render(
    <Switching
      actions={over.actions ?? null}
      at={AT}
      controls={over.controls ?? ADMIN_CONTROLS}
      drawer={over.drawer ?? null}
      gestures={null}
      groups={over.groups ?? null}
      manage={over.manage ?? null}
      newRailHref="/plans/p/new/rail?n=1"
      plan={over.plan ?? planScreenModel(atlasPlan())}
      progress={[]}
      root={PLAN_A}
      routes={ADMIN_DRAWER_ROUTES}
      tray={over.tray ?? null}
      zoom={over.zoom ?? 'feature'}
      zoomControl={null}
      zoomTo={null}
    />,
  )

// With the timeline chosen the table mounts once the screen has painted, so the first paint is the board
// alone (`./table/table-aside.tsx`); a test about the table waits for it rather than reading the first frame.
const tableIn = async (container: HTMLElement): Promise<Element> =>
  vi.waitFor(() => {
    const found = container.querySelector('[data-slot="plan-table"]')
    if (found === null) throw new Error('the table has not mounted yet')
    return found
  })

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
  it('draws the canvas, and keeps the table mounted beside it for a reader who cannot see one', async () => {
    const { container } = show()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    await tableIn(container)
    expect(screen.getByRole('table', { name: 'Table of Atlas rollout' })).toBeTruthy()
  })

  it('names every feature and item in the table while the timeline is the selected view', async () => {
    show()
    expect(radio('Timeline').checked).toBe(true)
    expect(await screen.findByTestId(`row-${FEATURE_1}`)).toBeTruthy()
    expect(screen.getByTestId(`row-${ITEM_1}`)).toBeTruthy()
  })

  it('still heads the page with the plan’s name as a real heading', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Atlas rollout' })).toBeTruthy()
  })
})

describe('the switch between them', () => {
  it('offers the choice as one native radio group, which a keyboard already knows how to move through', () => {
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

  it('checks the radio of the view it is handed, and only that one', () => {
    show()
    expect(radio('Timeline').checked).toBe(true)
    expect(radio('Table').checked).toBe(false)
  })

  it('puts the tabs in the toolbar and the panels outside it', () => {
    show()
    const tabs = slot('view-tabs')
    expect(tabs?.contains(radio('Timeline'))).toBe(true)
    expect(tabs?.contains(slot('timeline-panel'))).toBe(false)
  })

  // The canvas is an `<svg role="img">` with one label and nothing inside it a reader can use, so not
  // drawing it while the table is chosen costs a reader one alt text and saves every element it has.
  it('draws no canvas at all while the table is chosen, and draws it again when the timeline is', () => {
    show()
    fireEvent.click(radio('Table'))
    expect(slot('timeline-panel')).toBeNull()
    expect(screen.queryByRole('img', { name: 'Timeline of Atlas rollout' })).toBeNull()
    expect(screen.getByRole('table', { name: 'Table of Atlas rollout' })).toBeTruthy()
    fireEvent.click(radio('Timeline'))
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
  })

  // The one thing about the first revision's switch that was right, and kept: the table is the
  // accessible rendering of this plan, so it is taken off screen rather than removed.
  it('never removes the table, only takes it off screen, so it never leaves the accessibility tree', async () => {
    const { container } = show()
    await tableIn(container)
    expect(slot('table-panel')?.getAttribute('class')).toContain('sr-only')
    fireEvent.click(radio('Table'))
    expect(slot('table-panel')?.getAttribute('class')).not.toContain('sr-only')
  })

  // The table's search, filters, sort and column order are its own state, and the element is never
  // unmounted once it has mounted — so a reader who narrowed it, looked at the timeline and came back
  // finds it as they left it.
  it('keeps what the table was narrowed to across a switch, the element never being unmounted', () => {
    show()
    fireEvent.click(radio('Table'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'invoices' } })
    fireEvent.click(radio('Timeline'))
    fireEvent.click(radio('Table'))
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('invoices')
    expect(screen.getByTestId(`row-${FEATURE_1}`).hidden).toBe(true)
  })

  it('carries the switch on two radios with ids, which is what their labels name', () => {
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

  // There is no second pane any more. The rail tree was one — 17.5rem of rails beside a board listing
  // the same rails — and it is a sticky column inside the board's own scroller now. So the frame has
  // one region under the head row, and the rails are in the scroller they name.
  it('draws the board in the one pane the frame has, with the rails inside it', () => {
    show()
    expect(slot('plan-side')).toBeNull()
    expect(slot('plan-main')?.contains(slot('plan-board') as Node)).toBe(true)
    expect(slot('plan-board')?.contains(slot('rail-names') as Node)).toBe(true)
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
  it('puts it under the board and inside the timeline panel, never under the table', async () => {
    const { container } = show({ tray: TRAY })
    await tableIn(container)
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
    show({ plan: planScreenModel(unplacedPlan('no-estimate')) })
    const chip = slot('attention-chip')
    expect(chip?.textContent).toMatch(/need(s)? attention/)
  })
})

describe('the controls the screen is handed', () => {
  it('draws the whole plan for the weakest seat there is, no control being load-bearing', async () => {
    const { container } = show({ controls: planCapabilities('view', SEAT) })
    await tableIn(container)
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

  it('offers a view seat no row actions at all, rather than links to controls that would refuse it', async () => {
    const actions = async (container: HTMLElement): Promise<number> =>
      (await tableIn(container)).querySelectorAll('[data-slot="row-actions"]').length
    expect(await actions(show().container)).toBeGreaterThan(0)
    expect(await actions(show({ controls: planCapabilities('view', SEAT) }).container)).toBe(0)
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

// The two generated selection sheets — `labels/group-css.ts` for a group and
// `board/rail-select-css.ts` for a rail — are `:has()` rules anchored on one ancestor of both the radio and the
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

  it('contains the radios the rules key on and the marks they dim, both being inside one ancestor', async () => {
    const { container } = show()
    await tableIn(container)
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

// Both selection sheets key on two attributes of the shell, which the shell sets from whichever radio
// changed. They used to ask the radio itself, with `:has(#radio:checked)` anchored on the shell, and that
// made every hover at the cap restyle the whole screen against every rule: a quarter of a second a frame
// at 2,200 marks, where an idle frame is sixteen milliseconds (ADR 0069).
describe('the choice of a rail and of a group, said on the shell', () => {
  const chips = (): ReactNode => (
    <GroupChips
      allFit={allWorkFit(planScreenModel(atlasPlan()))}
      mayAdd={false}
      planId={PLAN_A}
      rows={labelRows(planScreenModel(atlasPlan()))}
    />
  )

  const radioNamed = (id: string): HTMLInputElement => {
    const found = document.getElementById(id)
    if (!(found instanceof HTMLInputElement)) throw new Error(`no radio ${id}`)
    return found
  }

  it('says which rail is chosen on the shell, and nothing once the choice is cleared', () => {
    show()
    fireEvent.click(radioNamed(railRadioId(EPIC_1)))
    expect(shell().getAttribute('data-sel-rail')).toBe(EPIC_1)
    fireEvent.click(radioNamed(NOTHING_SELECTED_ID))
    expect(shell().hasAttribute('data-sel-rail')).toBe(false)
  })

  it('says which group is chosen on the shell, and nothing once All work is', () => {
    show({ groups: chips() })
    fireEvent.click(radioNamed(groupRadioId(LABEL_1)))
    expect(shell().getAttribute('data-sel-group')).toBe(LABEL_1)
    fireEvent.click(radioNamed(ALL_RADIO_ID))
    expect(shell().hasAttribute('data-sel-group')).toBe(false)
  })

  it('keeps the two choices apart, a rail chosen inside a group being both at once', () => {
    show({ groups: chips() })
    fireEvent.click(radioNamed(groupRadioId(LABEL_1)))
    fireEvent.click(radioNamed(railRadioId(EPIC_1)))
    expect([shell().getAttribute('data-sel-group'), shell().getAttribute('data-sel-rail')]).toEqual([LABEL_1, EPIC_1])
  })

  // The board is not drawn while the table is (`./plan-views.tsx`), so its radios come back new; the shell
  // still says which rail is chosen, and the radio that says it to a screen reader has to agree.
  it('checks the chosen rail’s radio again when the board comes back from the table', () => {
    show()
    fireEvent.click(radioNamed(railRadioId(EPIC_1)))
    fireEvent.click(radio('Table'))
    fireEvent.click(radio('Timeline'))
    expect(radioNamed(railRadioId(EPIC_1)).checked).toBe(true)
    expect(radioNamed(NOTHING_SELECTED_ID).checked).toBe(false)
    expect(shell().getAttribute('data-sel-rail')).toBe(EPIC_1)
  })

  // A group chosen a moment after it was made is chosen under its placeholder; once its create is answered
  // the plan names it by its real id, which the store's `real` reads the placeholder as.
  it('keeps a group chosen before its create was answered chosen under the id it was answered with', () => {
    const stored = planScreenModel(atlasPlan())
    const pending = { ...stored, labels: stored.labels.map((one) => (one.id === LABEL_1 ? { ...one, id: 'pending:9' } : one)) }
    const named = new Map<string, string>()
    const real = (id: string): string => named.get(id) ?? id
    const drawn = (plan: PlanScreenModel) => (
      <Switching
        actions={null}
        at={AT}
        controls={ADMIN_CONTROLS}
        drawer={null}
        gestures={null}
        groups={<GroupChips allFit={allWorkFit(plan)} mayAdd={false} planId={PLAN_A} rows={labelRows(plan)} />}
        manage={null}
        newRailHref={null}
        plan={plan}
        progress={[]}
        real={real}
        root={PLAN_A}
        routes={ADMIN_DRAWER_ROUTES}
        tray={null}
        zoom="feature"
        zoomControl={null}
        zoomTo={null}
      />
    )
    const { rerender } = render(drawn(pending))
    fireEvent.click(radioNamed(groupRadioId('pending:9')))
    named.set('pending:9', LABEL_1)
    rerender(drawn(stored))
    expect(shell().getAttribute('data-sel-group')).toBe(LABEL_1)
    expect(radioNamed(groupRadioId(LABEL_1)).checked).toBe(true)
  })

  it('asks no element on the screen whether it :has() anything, in any sheet it ships', async () => {
    const { container } = show({ groups: chips() })
    await tableIn(container)
    const sheets = [...document.querySelectorAll('style')].map((one) => one.textContent ?? '').join('')
    expect(sheets).toContain('data-sel-group')
    expect(sheets).toContain('data-sel-rail')
    expect(sheets).not.toContain(':has(')
  })
})

// The same join the block above exists for, for the hover sheet: `POINTER_CSS` names five slots and
// paints nothing at all if the screen renders none of them, and a rule that matches nothing is valid
// CSS. So each slot it names is asserted to be something under the root that listens for the hover.
describe('the root that listens for a pointer over the plan', () => {
  it('wraps the whole screen, so a hover anywhere on it can reach a bar on the canvas', () => {
    show()
    const root = document.querySelector('[data-slot="plan-pointer"]')

    expect(root).not.toBeNull()
    expect(root?.querySelector(PLAN_ROOT)).toBe(shell())
    expect(root?.querySelector('[data-slot="feature-bar"][data-hover-id]')).not.toBeNull()
  })

  it('mounts the sheet that paints a lit mark, every slot of which the screen renders', () => {
    // At the Sprint rung, which is the one that draws item ticks: a sheet naming a slot no rendering
    // produces is a rule that matches nothing, which is the defect this whole block exists to catch.
    show({ zoom: 'item' })
    const sheets = [...document.querySelectorAll('style')].map((one) => one.textContent ?? '').join('')

    expect(sheets).toContain(POINTER_CSS)
    for (const slot of LIT_SLOTS) {
      expect(POINTER_CSS, slot).toContain(`[data-slot="${slot}"][data-lit]`)
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull()
    }
  })

  // An item mark is the one thing on the board there are thousands of. Faded rather than switched, every
  // hover animated all of them at once, and at the cap the frames after it stalled for up to a fifth of a
  // second painting opacity; switched, they hold sixteen milliseconds (ADR 0069). A group and an arc —
  // hundreds, not thousands — keep their fade.
  it('fades a group and an arc on a hover, and switches an item mark, there being thousands of those', () => {
    const rules = POINTER_CSS.split('}').filter((rule) => rule.includes('transition'))
    expect(rules.join('}')).toContain('[data-slot="feature-group"]')
    expect(rules.join('}')).toContain('[data-slot="arc"]')
    expect(rules.join('}')).not.toContain('[data-slot="item-mark"]')
  })

  it('tells the root the scale the canvas was actually drawn at, so a zoom anchors where it looks', () => {
    show()
    const root = document.querySelector('[data-slot="plan-pointer"]')
    const axis = planAxis(planScreenModel(atlasPlan()), AT, 'feature')

    expect(root?.getAttribute('data-px-per-day')).toBe(String(axis.scale.pxPerDay))
    expect(root?.getAttribute('data-axis-x')).toBe(String(axisX(axis.scale, axis.range)))
  })
})
