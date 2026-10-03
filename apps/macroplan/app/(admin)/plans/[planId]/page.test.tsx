import { render, screen } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import FeatureDrawerPage from './f/[featureId]/page'
import GroupDrawerPage from './g/[labelId]/page'
import ItemDrawerPage from './i/[itemId]/page'
import NewGroupPage from './new/group/page'
import NewRailPage from './new/rail/page'
import PlanPage from './page'
import RailDrawerPage from './r/[epicId]/page'

// What is left of the sweeps this file used to hold.
//
// The canvas, the table, the plan read and `generateMetadata` moved to `layout.tsx` — a layout does
// not re-render when navigation moves between its children, so selecting a feature re-renders the
// drawer and not the 2,000 nodes beside it. Every assertion about reading a plan, refusing one, and
// handing no share token to a component moved with the read, to `layout.test.tsx`. **The one
// assertion kept here is the one about functions**, because it is about this file's surface and not
// about the read: this page is the no-selection state, it takes no params, it calls nothing, and it
// must stay something that hands nothing over. `page.test.tsx` asserting it is what makes "the empty
// state is markup and not a boundary" checkable from the page's own test rather than by inspection.
const functionsIn = (value: unknown, seen = new WeakSet<object>()): readonly string[] => {
  if (typeof value === 'function') return [value.name]
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  const children = Object.values(isValidElement(value) ? (value.props as object) : value)
  return children.flatMap((child: unknown) => functionsIn(child, seen))
}

const shown = (): ReactNode => PlanPage()

describe('the plan page with nothing selected', () => {
  // It used to render one sentence saying what the address does, because the drawer was then a card in the
  // page's own flow and an empty slot would have been an unexplained gap. A drawer is now a panel docked to
  // the right-hand edge, so nothing open means no panel and the graph has the full width — and the sentence
  // would have been out of date besides, the sidebar now linking to every rail and every feature.
  it('renders nothing at all, a docked drawer needing no placeholder to explain a gap', () => {
    render(shown())
    expect(shown()).toBeNull()
    expect(document.body.textContent).toBe('')
  })

  it('draws no panel, because a collapsed drawer is markup with nothing in it to read', () => {
    render(shown())
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(document.querySelector('[data-slot="drawer-panel"]')).toBeNull()
    expect(document.querySelector('[data-slot="drawer-shell"]')).toBeNull()
    expect(document.querySelector('dl')).toBeNull()
  })

  it('claims no heading of its own, the plan’s name being the layout’s h1 one level up', () => {
    render(shown())
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('takes no route params, so the empty state cannot differ from one plan to the next', () => {
    expect(PlanPage).toHaveLength(0)
  })

  it('sees a function planted where a bound action would sit, so “none at all” is checkable', () => {
    const write = async (planId: string): Promise<void> => {
      await Promise.resolve(planId)
    }
    expect(functionsIn(<form action={write.bind(null, 'a-plan')} />)).toHaveLength(1)
  })

  it('hands over no function at all, so no token is hiding in a bound action’s arguments', () => {
    expect(functionsIn(shown())).toEqual([])
  })
})

// Each drawer route was a server page: it read the plan, found its subject, and rendered the panel — a
// request and a render for every drawer opened, revealed no sooner than React's Suspense throttle allowed.
// The drawer is read off the address and drawn in the browser now, from the plan the layout handed over
// once (`components/plan/app/plan-drawer.tsx`, ADR 0069); its tests are `plan-drawer.test.tsx`. What
// is left here is the route's half: each address still exists, and asks for nothing and draws nothing.
describe('every drawer route under the plan, which the browser draws', () => {
  it.each([
    ['a feature', FeatureDrawerPage],
    ['an item', ItemDrawerPage],
    ['a rail', RailDrawerPage],
    ['a group', GroupDrawerPage],
    ['a new rail', NewRailPage],
    ['a new group', NewGroupPage],
  ])('renders nothing for %s and takes no params, so it can read nothing', (_what, Page) => {
    expect(Page).toHaveLength(0)
    expect(Page()).toBeNull()
  })
})
