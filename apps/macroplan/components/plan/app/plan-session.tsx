import type { PlanBridge } from '@repo/api-client'
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import type { ItemDrawerRead } from '../../../actions/drawer-reads'
import type { ActionResult } from '../../../actions/result'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import type { PlanControls } from '../../../lib/plan-capabilities'
import type { BindProjectWrite } from '../bridge/bind-project-form'
import type { PlanEditActions } from '../edit-actions'
import type { PlanScreenModel } from '../plan-screen-model'
import type { PlanGestures } from '../store/gestures'
import type { PlanSnapshot, PlanStore } from '../store/plan-store'

/** Which surface the plan is open on: the admin's own, or a seat's link. */
export type PlanSurface =
  | { readonly kind: 'admin'; readonly planId: string }
  | { readonly kind: 'seat'; readonly token: string }

/** Reads what an item's drawer needs and the plan does not carry; a seat's is bound to its token. */
export type ItemRead = (
  planId: string,
  itemId: string,
  epicId: string | null,
) => Promise<ActionResult<ItemDrawerRead>>

/** Everything the plan screen's components share, set up once by `PlanApp` (`./plan-app.tsx`). */
export interface PlanSession {
  /** The plan as it stands and every change made to it, optimistic (`../store/plan-store.ts`). */
  readonly store: PlanStore

  /** The surface's writes, each put through the store. */
  readonly writes: PlanEditActions

  /** The two writes that chain: a draw and a rail drop. */
  readonly gestures: PlanGestures

  /** What this viewer may do. */
  readonly controls: PlanControls

  readonly surface: PlanSurface

  /** The plan's own path, `/plans/<id>` or `/s/<token>`, which every drawer address hangs off. */
  readonly home: string

  /**
   * The plan id or the seat token, whichever roots this surface's URLs: what `routes` builds each address
   * from, as every board, table and tray link is built (`../../../lib/drawer-routes.ts`). Never a path — a
   * builder handed one encodes it into the address.
   */
  readonly root: string

  readonly routes: DrawerRoutes

  /** What the bridge said about the plan's rails and linked items, or `null` where it did not answer. */
  readonly bridge: PlanBridge | null

  readonly readItem: ItemRead

  /** Binds a rail by naming its project — the admin's rail drawer only. */
  readonly bindProject: BindProjectWrite | null
}

const PlanSessionContext = createContext<PlanSession | null>(null)

/** Hands the plan screen its session. */
export const PlanSessionProvider = PlanSessionContext.Provider

/**
 * The plan screen's session.
 *
 * A context rather than props threaded through every layer, because the drawer, the slots and the board
 * are siblings several levels apart and every one of them needs the same store and the same writes; and
 * one value set once per page, so reading it re-renders nothing.
 *
 * @returns The session `PlanApp` set up.
 */
export function usePlanSession(): PlanSession {
  const held = useContext(PlanSessionContext)
  if (held === null) throw new Error('A plan screen component was rendered outside PlanApp')
  return held
}

/**
 * The plan as it is now, pending changes and all, whether any is still being saved, and the refusal on screen.
 *
 * `useSyncExternalStore` over the store, so a server render and the first client render read the same
 * snapshot. A component reading it re-renders whenever any of the three changes; one that draws the plan
 * alone reads {@link usePlan} instead.
 *
 * @returns The store's snapshot.
 */
export function usePlanSnapshot(): PlanSnapshot {
  const { store } = usePlanSession()
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/**
 * The plan as it is now, pending changes and all — and nothing else from the store.
 *
 * The store hands back the same plan object until the plan changes, so a component reading this re-renders
 * exactly then: not when a write starts or lands without changing it, and not when the notice says or
 * forgets a refusal. The whole screen reads the plan this way, which is what keeps dismissing a notice
 * from redrawing two thousand marks.
 *
 * @returns The store's plan.
 */
export function usePlan(): PlanScreenModel {
  const { store } = usePlanSession()
  const read = useCallback(() => store.getSnapshot().plan, [store])
  return useSyncExternalStore(store.subscribe, read, read)
}
