import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { addressOf, answeredSelection, selectionOf, type Selection } from '../nav/drawer-route'
import { usePlanNav } from '../nav/plan-nav'
import { GroupDrawer, NewGroupDrawer, NewRailDrawer } from './group-drawers'
import { usePlanSession } from './plan-session'
import { RailDrawer } from './rail-drawer'
import { SubjectDrawer } from './subject-drawer'

const useAnsweredSelection = (home: string, real: (id: string) => string): Selection => {
  const { go } = usePlanNav()
  const asked = selectionOf(home, usePathname(), useSearchParams())
  const selection = answeredSelection(asked, real)
  const moved = selection === asked || selection === null || !('id' in selection) ? null : addressOf(home, selection)
  useEffect(() => {
    if (moved !== null) go(moved, { replace: true })
  }, [go, moved])
  return selection
}

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
 *
 * ### A drawer on something created a moment ago
 *
 * Opened before the create was answered, the address names a placeholder the API never issued. The
 * address is read through the store, so once the answer has replaced the placeholder on the plan the drawer
 * goes on finding its subject under the real id — and then moves the address there, with `replace`, so a
 * reload or a copied link opens it. The panel is keyed by the id its subject was **first** drawn under,
 * which the answer does not change, so the field the reader is typing in stays the one they are typing in.
 */
export function PlanDrawer() {
  const { home, surface, store } = usePlanSession()
  const selection = useAnsweredSelection(home, store.real)
  if (selection === null) return null
  if (selection.kind === 'feature' || selection.kind === 'item') {
    const key = `${selection.kind}:${store.first(selection.id)}`
    return <SubjectDrawer id={selection.id} key={key} kind={selection.kind} open={selection.open} />
  }
  if (surface.kind !== 'admin') return null
  if (selection.kind === 'rail') return <RailDrawer epicId={selection.id} key={store.first(selection.id)} />
  if (selection.kind === 'group') return <GroupDrawer key={store.first(selection.id)} labelId={selection.id} />
  return selection.kind === 'new-rail' ? <NewRailDrawer count={selection.count} /> : <NewGroupDrawer />
}
