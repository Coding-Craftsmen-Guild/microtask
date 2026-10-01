import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_DRAWER_ROUTES, featurePath, PLAN_DRAWERS, railPath, SEAT_DRAWER_ROUTES } from '../../../lib/drawer-routes'
import { detailsOf } from '../canvas/detail-lines'
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
import { TREE_CSS } from './sidebar-css'
import { sidebarRails } from './sidebar-rows'
import { SIDEBAR_WORDS } from './sidebar-words'

vi.mock('next/link', async () => ({
  default: (await import('../testing/next-link')).LinkDouble,
}))

afterEach(cleanup)

const RAILS = sidebarRails(planScreenModel(railedPlan()))

const NOTHING_WRONG = new Map<string, never[]>()

const show = (rails = RAILS) =>
  render(
    <PlanSidebar
      actions={null}
      found={NOTHING_WRONG}
      rails={rails}
      root={PLAN_A}
      routes={ADMIN_DRAWER_ROUTES}
    />,
  )

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

  // Two gestures on one row, and still deliberately different things — but the other way round from
  // the first revision. The colour chip selects, which costs no navigation; the name opens the drawer.
  // A separate 'Open' link beside the name is what overflowed the column and landed on the canvas.
  it('wires each row’s colour chip to its own selection radio, and its name to its drawer', () => {
    show()
    const forRail = screen.getByLabelText('Highlight Platform')
    expect(forRail.getAttribute('for')).toBe(railRadioId(EPIC_1))
    expect(screen.getByLabelText('Highlight Auth rewrite').getAttribute('for')).toBe(
      featureRadioId(FEATURE_1),
    )
    expect(screen.getByText('Platform').getAttribute('href')).toBe(railPath(PLAN_A, EPIC_1))
  })

  it('draws no separate Open link, which is the thing that used to escape the column', () => {
    show()
    expect(screen.queryByText('Open')).toBeNull()
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

  // Every sheet the sidebar emits, joined, rather than the first one: the disclosure's static rules are
  // emitted beside the generated selection sheet now, and an assertion that read `querySelector` alone
  // would be asserting which of the two happens to come first.
  it('emits the selection stylesheet beside the rows it drives', () => {
    show()
    const sheets = [...document.querySelectorAll('style')].map((one) => one.textContent ?? '').join('')
    expect(sheets).toContain(railRadioId(EPIC_1))
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

describe('the sidebar carries the tree’s own action and no other', () => {
  it('offers adding a rail to a reader who may, since that is what the tree is a tree of', () => {
    render(
      <PlanSidebar
        actions={<SidebarActions mayAddRail planId={PLAN_A} railCount={RAILS.length} />}
        found={NOTHING_WRONG}
        rails={RAILS}
        root={PLAN_A}
        routes={ADMIN_DRAWER_ROUTES}
      />,
    )
    const hrefs = [...document.querySelectorAll('a')].map((one) => one.getAttribute('href'))
    expect(hrefs).toContain(PLAN_DRAWERS.newRail(PLAN_A, RAILS.length))
  })

  // The other three moved to PlanManage, beside the plan's name. Crowded in over the tree they pushed
  // it down and made the one action that is about rails compete with three that are not.
  it('offers none of the whole-plan links, which live beside the plan’s name now', () => {
    render(
      <PlanSidebar
        actions={<SidebarActions mayAddRail planId={PLAN_A} railCount={RAILS.length} />}
        found={NOTHING_WRONG}
        rails={RAILS}
        root={PLAN_A}
        routes={ADMIN_DRAWER_ROUTES}
      />,
    )
    const hrefs = [...document.querySelectorAll('a')].map((one) => one.getAttribute('href'))
    expect(hrefs).not.toContain(PLAN_DRAWERS.newGroup(PLAN_A))
    expect(hrefs).not.toContain(PLAN_DRAWERS.settings(PLAN_A))
    expect(hrefs).not.toContain(PLAN_DRAWERS.share(PLAN_A))
  })

  it('draws nothing at all for a reader who may not add a rail, and never a link that would 404', () => {
    render(
      <PlanSidebar
        actions={<SidebarActions mayAddRail={false} planId={PLAN_A} railCount={RAILS.length} />}
        found={NOTHING_WRONG}
        rails={RAILS}
        root={PLAN_A}
        routes={ADMIN_DRAWER_ROUTES}
      />,
    )
    expect(screen.queryByText(SIDEBAR_WORDS.newRail)).toBeNull()
    expect(document.querySelector('[data-slot="sidebar-actions"]')).toBeNull()
  })

  it('draws no action at all where the page handed none', () => {
    show()
    expect(document.querySelector('[data-slot="sidebar-actions"]')).toBeNull()
    expect(screen.getByText('Platform')).toBeTruthy()
  })

  // A feature reachable on the canvas and absent from the sidebar would be a feature nobody could open,
  // which is the failure this whole sidebar exists to fix. railsOf gives such a rail one of its own.
  it('still lists the rail no epic claims, so nothing on the canvas is unreachable', () => {
    show()
    const hrefs = [...document.querySelectorAll('a')].map((one) => one.getAttribute('href'))
    expect(hrefs).toContain(railPath(PLAN_A, EPIC_UNCLAIMED))
    expect(hrefs).toContain(featurePath(PLAN_A, FEATURE_5))
    expect(screen.getByText('(unnamed)')).toBeTruthy()
  })
})

describe('the sidebar draws the links of whichever surface mounted it', () => {
  // The tree used to import the admin builders, so a seat holder following a rail link would be sent
  // to /plans/…, a surface that reads a cookie they have not got, and on to a sign-in with no password.
  it('roots every feature link at the token when the seat surface mounts it', () => {
    render(
      <PlanSidebar
        actions={null}
        found={NOTHING_WRONG}
        rails={RAILS}
        root="tok3n"
        routes={SEAT_DRAWER_ROUTES}
      />,
    )
    const hrefs = [...document.querySelectorAll('a')].map((one) => one.getAttribute('href') ?? '')
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href.startsWith('/s/tok3n/')).toBe(true)
  })

  it('renders a rail as plain text where the surface has no rail drawer to open', () => {
    render(
      <PlanSidebar
        actions={null}
        found={NOTHING_WRONG}
        rails={RAILS}
        root="tok3n"
        routes={SEAT_DRAWER_ROUTES}
      />,
    )
    expect(screen.getByText('Platform').tagName).toBe('SPAN')
  })
})

describe('an entity that wants looking at is marked where it is listed', () => {
  it('puts a dot on the row and says what is wrong in its title', () => {
    render(
      <PlanSidebar
        actions={null}
        found={new Map([[FEATURE_1, [{ kind: 'no-estimate' as const, detail: 'Needs an estimate' }]]])}
        rails={RAILS}
        root={PLAN_A}
        routes={ADMIN_DRAWER_ROUTES}
      />,
    )
    const dots = [...document.querySelectorAll('[data-slot="attention-dot"]')]
    expect(dots).toHaveLength(1)
    expect(dots[0]?.getAttribute('title')).toBe('Needs an estimate')
  })

  it('marks nothing on a plan with nothing wrong, so the mark means something when it appears', () => {
    show()
    expect(document.querySelectorAll('[data-slot="attention-dot"]')).toHaveLength(0)
  })
})

describe('what a feature row hands the hover root', () => {
  it('writes its joined detail onto the row, which is what makes a sidebar hover and a bar hover one gesture', () => {
    show()
    const details = detailsOf(planScreenModel(railedPlan()))
    const rows = [...document.querySelectorAll('[data-slot="sidebar-row"][data-hover-id]')]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const id = row.getAttribute('data-hover-id') ?? ''
      expect(row.getAttribute('data-detail'), id).toBe(details.get(id))
    }
  })

  it('keys the row on the same feature id the bar is keyed on, which is what joins the two', () => {
    show()
    const row = document.querySelector(`[data-slot="sidebar-row"][data-hover-id="${FEATURE_1}"]`)
    expect(row).toBeTruthy()
  })

  it('leaves a rail row out of it, so a pointer crossing the tree lights nothing until it reaches a feature', () => {
    show()
    const rails = [...document.querySelectorAll('[data-slot="sidebar-row"]')].filter(
      (row) => row.querySelector('[data-slot="rail-swatch"]') !== null,
    )
    expect(rails.length).toBeGreaterThan(0)
    for (const rail of rails) {
      expect(rail.getAttribute('data-hover-id')).toBeNull()
      expect(rail.getAttribute('data-detail')).toBeNull()
    }
  })
})

describe('a rail as a dropdown', () => {
  const branches = (): readonly Element[] => [...document.querySelectorAll('[data-slot="rail-branch"]')]

  it('gives every rail a disclosure that starts open, so nothing is hidden until somebody hides it', () => {
    show()
    const toggles = [...document.querySelectorAll<HTMLInputElement>('[data-slot="rail-toggle"]')]

    expect(toggles).toHaveLength(RAILS.length)
    expect(toggles.filter((one) => one.defaultChecked)).toEqual([])
    expect(toggles.map((one) => one.type)).toEqual(RAILS.map(() => 'checkbox'))
  })

  it('names the control for the rail it opens, which is the only label a bare triangle gets', () => {
    show()
    const first = RAILS[0]

    expect(screen.getByLabelText(`${SIDEBAR_WORDS.collapse} ${first?.name ?? ''}`)).toBeTruthy()
  })

  it('keeps each rail’s features in one element the disclosure can hide, and its rows out of it', () => {
    show()
    for (const [index, rail] of RAILS.entries()) {
      const branch = branches()[index]
      const kids = branch?.querySelector('[data-slot="rail-kids"]')
      expect(kids, rail.name).toBeTruthy()
      expect(kids?.querySelectorAll('[data-slot="sidebar-row"]')).toHaveLength(rail.features.length)
    }
  })

  it('puts the disclosure before the row it belongs to, so a sibling rule can reach what it hides', () => {
    show()
    const branch = branches()[0]
    const kinds = [...(branch?.children ?? [])].map((one) => one.getAttribute('data-slot'))

    expect(kinds.indexOf('rail-toggle')).toBeLessThan(kinds.indexOf('rail-kids'))
  })

  it('hides what it hides from a rule on the branch, not from a second peer that would tint every row', () => {
    show()
    const toggle = document.querySelector('[data-slot="rail-toggle"]')
    const sheets = [...document.querySelectorAll('style')].map((one) => one.textContent ?? '').join('')

    expect(toggle?.className.split(' ')).not.toContain('peer')
    expect(sheets).toContain(TREE_CSS)
    expect(TREE_CSS).toContain('[data-slot="rail-branch"]:has(> [data-slot="rail-toggle"]:checked)')
  })

  it('names in its sheet only slots the tree really renders, a rule matching nothing being valid CSS', () => {
    show()
    for (const slot of ['rail-branch', 'rail-toggle', 'rail-kids', 'rail-caret']) {
      expect(TREE_CSS, slot).toContain(`[data-slot="${slot}"]`)
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull()
    }
  })
})
