import type { ScopeValue } from '@repo/contracts'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { ADMIN_CONTROLS } from '../../lib/admin-controls'
import { planCapabilities, type PlanControls } from '../../lib/plan-capabilities'
import type { PlanEditActions } from './edit-actions'
import { PlanScreen } from './plan-screen'
import { planScreenModel } from './plan-screen-model'
import { atlasPlan, FEATURE_1, ITEM_1, PLAN_A } from './testing/plan-fixture'
import { stubActions } from './testing/plan-writes'

const AT = new Date('2026-10-05T09:00:00.000Z')

const SEAT: ScopeValue = { kind: 'plan', planId: PLAN_A }

// A marker rather than a `DrawerPanel`: what is asserted below is where the slot puts whatever fills
// it and whether it draws anything when nothing does, and a real panel would make those two facts
// depend on a second component's markup.
const MARKER: ReactNode = <p data-testid="drawer-marker">whatever is open</p>

// The conflict slot's marker, and a marker for the same reason: what is asserted below is where the
// slot puts what fills it, and a real `ConflictList` would tie that to a second component's markup —
// and to whether the fixture happens to contradict itself, which is `conflict-list.test.tsx`'s subject
// and not this file's.
const CONFLICTS: ReactNode = <p data-testid="conflicts-marker">what is wrong with the plan</p>

// The fixture is a `StoredPlan`, where `shareLinks` is required, and `PlanScreen.plan` is the type a
// token cannot be represented in — so the fixture is reduced by the component's own reducer rather
// than cast past it. That the unwrapped call no longer compiles is the narrowing working.
//
// `drawer` defaults to `null` here because that is what a surface with no drawer route passes: the
// prop is required, so every case below states which of the two it is rendering.
//
// `actions` defaults to `null`, which is what `/s/<token>` passes and what every case about layout wants:
// the writes decide whether the canvas's drag listens, and nothing else about this screen.
const show = (
  controls: PlanControls = ADMIN_CONTROLS,
  drawer: ReactNode = null,
  conflicts: ReactNode = null,
  actions: PlanEditActions | null = null,
) =>
  render(
    <PlanScreen
      actions={actions}
      at={AT}
      conflicts={conflicts}
      controls={controls}
      drawer={drawer}
      plan={planScreenModel(atlasPlan())}
    />,
  )

const dragging = (container: HTMLElement): string | null =>
  container.querySelector('[data-slot="drag-root"]')?.getAttribute('data-drag') ?? null

const gridChildren = (container: HTMLElement): readonly Element[] => {
  const grid = container.firstElementChild
  if (grid === null) throw new Error('the screen rendered nothing at all')
  return [...grid.children]
}

const firstRadio = (): HTMLElement => {
  const found = screen.getAllByRole('radio')[0]
  if (found === undefined) throw new Error('the view switch drew no radio')
  return found
}

const radio = (name: string): HTMLInputElement => {
  const found = screen.getByRole('radio', { name })
  if (!(found instanceof HTMLInputElement)) throw new Error(`${name} is not an input`)
  return found
}

const classesOf = (element: Element | null | undefined): string =>
  element?.getAttribute('class') ?? ''

const tablePanel = (): Element | null =>
  screen.getByRole('table', { name: 'Table of Atlas rollout' }).parentElement

const scroller = (): Element | null => document.querySelector('.overflow-x-auto')

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
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('describes the choice on both radios, rather than claiming a group the markup is not', () => {
    show()
    const hint = document.getElementById('plan-view-hint')
    expect(hint?.textContent).toContain('which rendering of this plan is on screen')
    for (const one of screen.getAllByRole('radio')) {
      expect(one.getAttribute('aria-describedby')).toBe('plan-view-hint')
    }
    expect(document.querySelectorAll('fieldset, [role="radiogroup"]')).toHaveLength(0)
  })

  it('starts on the timeline, which is the rendering §5 makes this product’s own', () => {
    show()
    expect(radio('Timeline').checked).toBe(true)
    expect(radio('Table').checked).toBe(false)
  })

  it('keeps each radio a sibling of both panels, because a peer variant is a sibling selector', () => {
    show()
    const parent = radio('Timeline').parentElement
    expect(parent).toBe(radio('Table').parentElement)
    expect(parent).toBe(scroller()?.parentElement)
    expect(parent).toBe(tablePanel()?.parentElement)
  })

  it('hides the canvas when the table is chosen, which costs a reader one img label', () => {
    show()
    expect(classesOf(scroller())).toContain('peer-checked/table:hidden')
  })

  it('never hides the table, only takes it off screen, so it never leaves the accessibility tree', () => {
    show()
    expect(classesOf(tablePanel())).toContain('peer-checked/timeline:sr-only')
    expect(classesOf(tablePanel()).split(' ').filter((one) => one.endsWith('hidden'))).toEqual([])
  })

  it('leaves the table outside the canvas’s own horizontal scroller', () => {
    show()
    expect(scroller()?.querySelector('table')).toBeNull()
    expect(document.querySelectorAll('.overflow-x-auto')).toHaveLength(1)
  })

  it('carries the switch on inputs the browser owns, so nothing here needs a state hook', () => {
    show()
    expect(radio('Timeline').getAttribute('type')).toBe('radio')
    expect(screen.getAllByRole('radio').map((one) => one.getAttribute('id'))).toEqual([
      'plan-view-timeline',
      'plan-view-table',
    ])
  })
})

// Two documented decisions, unguarded until now — and both are edited again by the tasks that draw a
// conflict list and a share manager into this same file, where markup order regresses silently.
describe('the slot whatever is open beside the plan fills', () => {
  it('adds nothing to the screen where there is no drawer, rather than an empty container', () => {
    const empty = gridChildren(show().container)
    const filled = gridChildren(show(ADMIN_CONTROLS, MARKER).container)
    expect(empty).toHaveLength(2)
    expect(filled).toHaveLength(empty.length + 1)
    expect(screen.getAllByTestId('drawer-marker')).toHaveLength(1)
  })

  it('puts it above the view switch, so a drawer never opens below 2,200 rows of table', () => {
    show(ADMIN_CONTROLS, MARKER)
    const marker = screen.getByTestId('drawer-marker')
    expect(marker.compareDocumentPosition(firstRadio()) & marker.DOCUMENT_POSITION_FOLLOWING).toBe(
      marker.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('leaves it outside the flex parent the radios and the panels share, being no peer of them', () => {
    show(ADMIN_CONTROLS, MARKER)
    expect(screen.getByTestId('drawer-marker').parentElement).not.toBe(firstRadio().parentElement)
  })
})

// The second slot, and the three documented facts about it: it is empty on a surface that cannot link
// to a drawer, it is above the drawer rather than below it, and it is no peer of the radios. The order
// of the two slots is what regresses silently when the share manager is drawn into this same file.
describe('the slot the plan’s own contradictions fill', () => {
  it('adds nothing where a surface has none to draw, rather than an empty container', () => {
    const empty = gridChildren(show().container)
    const filled = gridChildren(show(ADMIN_CONTROLS, null, CONFLICTS).container)
    expect(empty).toHaveLength(2)
    expect(filled).toHaveLength(empty.length + 1)
    expect(screen.getAllByTestId('conflicts-marker')).toHaveLength(1)
  })

  it('puts it above the view switch, so a conflict never sits below 2,200 rows of table', () => {
    show(ADMIN_CONTROLS, null, CONFLICTS)
    const marker = screen.getByTestId('conflicts-marker')
    expect(marker.compareDocumentPosition(firstRadio()) & marker.DOCUMENT_POSITION_FOLLOWING).toBe(
      marker.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('puts it above the drawer, the plan’s own faults preceding whichever subject is open', () => {
    show(ADMIN_CONTROLS, MARKER, CONFLICTS)
    const marker = screen.getByTestId('conflicts-marker')
    const drawer = screen.getByTestId('drawer-marker')
    expect(marker.compareDocumentPosition(drawer) & marker.DOCUMENT_POSITION_FOLLOWING).toBe(
      marker.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('keeps it out of the flex parent the radios and the panels share, being no peer of them', () => {
    show(ADMIN_CONTROLS, MARKER, CONFLICTS)
    expect(screen.getByTestId('conflicts-marker').parentElement).not.toBe(
      firstRadio().parentElement,
    )
  })

  it('draws four children with both slots filled: the heading, the two slots and the switch', () => {
    const children = gridChildren(show(ADMIN_CONTROLS, MARKER, CONFLICTS).container)
    expect(children).toHaveLength(4)
    expect(children[1]).toBe(screen.getByTestId('conflicts-marker'))
    expect(children[2]).toBe(screen.getByTestId('drawer-marker'))
  })
})

describe('the controls the screen is handed', () => {
  it('draws the whole plan for the weakest seat there is, no control being load-bearing', () => {
    show(planCapabilities('view', SEAT))
    expect(screen.getByRole('heading', { level: 1, name: 'Atlas rollout' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Table of Atlas rollout' })).toBeTruthy()
    expect(screen.getByTestId(`row-${FEATURE_1}`)).toBeTruthy()
    expect(screen.getByTestId(`row-${ITEM_1}`)).toBeTruthy()
  })

  // This case was "renders alike for the admin and for a view seat, this phase drawing none of them",
  // and its own comment asked the first task to draw a control to change it deliberately. The canvas's
  // drag is that control, and it is drawn from two answers rather than one — the writes this screen was
  // handed, and `controls.placeFeature` — so the claim splits in two. **Handed no writes**, the two
  // audiences' markup is still identical, which is what keeps the old assertion worth having: a surface
  // that hands over nothing draws the same screen whatever its seat may do.
  it('renders alike for the admin and for a view seat while it is handed no write at all', () => {
    const { container: admin } = show()
    const { container: seat } = show(planCapabilities('view', SEAT))
    expect(seat.innerHTML).toBe(admin.innerHTML)
    expect(dragging(admin)).toBe('false')
  })

  it('listens for a drag once it holds the writes, and not for a seat that may not place', () => {
    const actions = stubActions()
    expect(dragging(show(ADMIN_CONTROLS, null, null, actions).container)).toBe('true')
    const seat = show(planCapabilities('view', SEAT), null, null, actions)
    expect(dragging(seat.container)).toBe('false')
  })

  it('refuses the drag to a write seat and offers it to a manage seat, which is where feature:place sits', () => {
    const actions = stubActions()
    expect(dragging(show(planCapabilities('write', SEAT), null, null, actions).container)).toBe('false')
    expect(dragging(show(planCapabilities('manage', SEAT), null, null, actions).container)).toBe('true')
  })
})
