import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { featurePath, PLAN_DRAWERS, railPath } from '../../../lib/drawer-routes'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  EPIC_1,
  EPIC_UNCLAIMED,
  FEATURE_1,
  FEATURE_5,
  PLAN_A,
  railedPlan,
} from '../testing/plan-fixture'
import { PlanSidebar } from './plan-sidebar'
import { SidebarActions } from './sidebar-actions'
import { featureRadioId, railRadioId } from './select-css'
import { sidebarRails } from './sidebar-rows'
import { SIDEBAR_WORDS } from './sidebar-words'

vi.mock('next/link', async () => ({
  default: (await import('../testing/next-link')).LinkDouble,
}))

afterEach(cleanup)

const RAILS = sidebarRails(planScreenModel(railedPlan()))

const show = (rails = RAILS) =>
  render(<PlanSidebar actions={null} planId={PLAN_A} rails={rails} />)

const rows = (): readonly HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="sidebar-row"]'),
]

const visible = (): readonly string[] =>
  rows().filter((row) => !row.hidden).map((row) => row.getAttribute('data-search') ?? '')

const type = (value: string): void => {
  fireEvent.change(screen.getByLabelText(SIDEBAR_WORDS.search), { target: { value } })
}

describe('the sidebar lists what the plan holds', () => {
  it('names every rail and every feature on it', () => {
    show()
    expect(screen.getByText('Platform')).toBeTruthy()
    expect(screen.getByText('Checkout')).toBeTruthy()
    expect(screen.getByText('Auth rewrite')).toBeTruthy()
  })

  it('links each rail and each feature to its own drawer, which is how anything is opened', () => {
    show(sidebarRails(planScreenModel(atlasPlan())))
    const hrefs = [...document.querySelectorAll('a')].map((one) => one.getAttribute('href'))
    expect(hrefs).toContain(railPath(PLAN_A, EPIC_1))
    expect(hrefs).toContain(featurePath(PLAN_A, FEATURE_1))
  })

  // Two gestures on one row, and deliberately different things: the name selects, which costs no
  // navigation, and Open navigates. A row whose name were a link would make every glance a round trip.
  it('wires each name to its own selection radio rather than to a link', () => {
    show()
    expect(screen.getByText('Platform').getAttribute('for')).toBe(railRadioId(EPIC_1))
    expect(screen.getByText('Auth rewrite').getAttribute('for')).toBe(featureRadioId(FEATURE_1))
  })

  it('shares one radio name across rails and features, so there is one selection and not two', () => {
    show()
    const names = [...document.querySelectorAll('input[type="radio"]')].map((one) =>
      one.getAttribute('name'),
    )
    expect(new Set(names).size).toBe(1)
  })

  it('starts with nothing selected, so a plan is first drawn at full strength', () => {
    show()
    const checked = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(
      (one) => one.defaultChecked,
    )
    expect(checked).toHaveLength(1)
    expect(checked[0]?.id).toBe('mp-sel-none')
  })

  it('emits the selection stylesheet beside the rows it drives', () => {
    show()
    expect(document.querySelector('style')?.textContent).toContain(railRadioId(EPIC_1))
  })

  it('says a rail with no features has none, that being the rail somebody needs to find', () => {
    show(sidebarRails(planScreenModel(atlasPlan({ features: [], items: [] }))))
    expect(screen.getByText('Platform')).toBeTruthy()
    expect(screen.getByText(SIDEBAR_WORDS.noFeatures)).toBeTruthy()
  })

  it('says a plan with no rails has none, and why a rail is the first thing to add', () => {
    show([])
    expect(screen.getByText(SIDEBAR_WORDS.noRails)).toBeTruthy()
    expect(screen.queryByLabelText(SIDEBAR_WORDS.search)).toBeNull()
  })
})

describe('the filter narrows the tree without navigating', () => {
  it('leaves every row visible before anything is typed', () => {
    show()
    expect(rows().length).toBeGreaterThan(0)
    expect(visible()).toHaveLength(rows().length)
  })

  it('hides the rows whose name does not contain what was typed', () => {
    show()
    type('auth')
    expect(visible()).toEqual(['auth rewrite'])
  })

  it('matches case-insensitively, the rows carrying a name the server already lowered', () => {
    show()
    type('AUTH')
    expect(visible()).toEqual(['auth rewrite'])
  })

  // A branch is a rail and its features: hiding the rail above a matching feature would turn the result
  // into a flat list of orphans, so a branch survives while anything inside it matches.
  it('keeps a branch whose feature matched, so a result still reads as a tree', () => {
    show()
    type('checkout')
    const branches = [...document.querySelectorAll<HTMLElement>('[data-slot="rail-branch"]')]
    const kept = branches.filter((one) => !one.hidden)
    expect(kept).toHaveLength(1)
    expect(kept[0]?.textContent).toContain('Checkout')
  })

  it('hides a branch nothing inside it matched', () => {
    show()
    type('auth')
    const branches = [...document.querySelectorAll<HTMLElement>('[data-slot="rail-branch"]')]
    expect(branches.filter((one) => one.hidden).length).toBeGreaterThan(0)
  })

  it('brings everything back when the field is cleared', () => {
    show()
    type('auth')
    type('')
    expect(visible()).toHaveLength(rows().length)
  })

  it('hides every row when nothing matches, rather than falling back to all of them', () => {
    show()
    type('nothing-is-called-this')
    expect(visible()).toEqual([])
  })

  it('navigates nowhere, so the graph beside it does not redraw while somebody types', () => {
    show()
    const before = document.querySelectorAll('a').length
    type('auth')
    expect(document.querySelectorAll('a')).toHaveLength(before)
  })
})

describe('the four plan-level links are drawn on four separate answers', () => {
  it('offers all four to a reader who may do all four', () => {
    render(
      <PlanSidebar
        actions={<SidebarActions mayAddGroup mayAddRail mayShare maySettings planId={PLAN_A} />}
        planId={PLAN_A}
        rails={RAILS}
      />,
    )
    const hrefs = [...document.querySelectorAll('a')].map((one) => one.getAttribute('href'))
    expect(hrefs).toContain(PLAN_DRAWERS.newRail(PLAN_A))
    expect(hrefs).toContain(PLAN_DRAWERS.newGroup(PLAN_A))
    expect(hrefs).toContain(PLAN_DRAWERS.settings(PLAN_A))
    expect(hrefs).toContain(PLAN_DRAWERS.share(PLAN_A))
  })

  it('offers only the rail to a reader who may only make one, and never a link that would 404', () => {
    render(
      <PlanSidebar
        actions={
          <SidebarActions
            mayAddGroup={false}
            mayAddRail
            mayShare={false}
            maySettings={false}
            planId={PLAN_A}
          />
        }
        planId={PLAN_A}
        rails={RAILS}
      />,
    )
    expect(screen.getByText(SIDEBAR_WORDS.newRail)).toBeTruthy()
    expect(screen.queryByText(SIDEBAR_WORDS.newGroup)).toBeNull()
    expect(screen.queryByText(SIDEBAR_WORDS.settings)).toBeNull()
    expect(screen.queryByText(SIDEBAR_WORDS.share)).toBeNull()
  })

  it('draws no action row at all where the page handed none', () => {
    show()
    expect(document.querySelector('[data-slot="sidebar-actions"]')).toBeNull()
    expect(screen.getByText('Platform')).toBeTruthy()
  })

  // A feature reachable on the canvas and absent from the sidebar would be a feature nobody could open,
  // which is the failure this whole sidebar exists to fix. `railsOf` gives such a rail one of its own.
  it('still lists the rail no epic claims, so nothing on the canvas is unreachable', () => {
    show()
    const hrefs = [...document.querySelectorAll('a')].map((one) => one.getAttribute('href'))
    expect(hrefs).toContain(railPath(PLAN_A, EPIC_UNCLAIMED))
    expect(hrefs).toContain(featurePath(PLAN_A, FEATURE_5))
    expect(screen.getByText('(unnamed)')).toBeTruthy()
  })
})
