import { usePathname, useSearchParams } from 'next/navigation'
import { selectionOf } from '../nav/drawer-route'
import { GroupDrawer, NewGroupDrawer, NewRailDrawer } from './group-drawers'
import { usePlanSession } from './plan-session'
import { RailDrawer } from './rail-drawer'
import { SubjectDrawer } from './subject-drawer'

/**
 * Whatever drawer the address names, drawn from the plan the browser holds.
 *
 * The drawer used to be the plan layout's child route: opening one was a request, a server render of the
 * page segment and a read of the plan, revealed no sooner than 300 ms after its `loading.tsx` fallback
 * because React throttles a Suspense boundary's reveal. It is still an address — linkable, reloadable,
 * steppable with Back — but the address is changed with `history.pushState` (`../nav/plan-nav.tsx`) and read
 * here, so it opens in the frame it is clicked in (ADR 0069).
 *
 * It is the one component that reads the address, so opening, switching and closing a drawer re-renders
 * this and nothing else on the screen. A feature's or an item's drawer is keyed by its subject, so moving
 * from one to another remounts the panel the way a navigation used to and no field carries a sentence over.
 * A seat has feature and item drawers only, as it had routes for those only.
 */
export function PlanDrawer() {
  const { home, surface } = usePlanSession()
  const selection = selectionOf(home, usePathname(), useSearchParams())
  if (selection === null) return null
  if (selection.kind === 'feature' || selection.kind === 'item') {
    const key = `${selection.kind}:${selection.id}`
    return <SubjectDrawer id={selection.id} key={key} kind={selection.kind} open={selection.open} />
  }
  if (surface.kind !== 'admin') return null
  if (selection.kind === 'rail') return <RailDrawer epicId={selection.id} key={selection.id} />
  if (selection.kind === 'group') return <GroupDrawer key={selection.id} labelId={selection.id} />
  return selection.kind === 'new-rail' ? <NewRailDrawer count={selection.count} /> : <NewGroupDrawer />
}
