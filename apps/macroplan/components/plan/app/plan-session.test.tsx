import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ADMIN_CONTROLS } from '../../../lib/admin-controls'
import { ADMIN_DRAWER_ROUTES } from '../../../lib/drawer-routes'
import { planPath } from '../../../lib/routes'
import { planScreenModel } from '../plan-screen-model'
import { planGestures } from '../store/gestures'
import { optimisticActions } from '../store/optimistic-actions'
import { createPlanStore, type PlanStore } from '../store/plan-store'
import { atlasPlan, PLAN_A } from '../testing/plan-fixture'
import { stubActions } from '../testing/plan-writes'
import { PlanSessionProvider, usePlan, type ItemRead, type PlanSession } from './plan-session'

const sessionOver = (store: PlanStore): PlanSession => {
  const raw = stubActions()
  return {
    store,
    writes: optimisticActions(raw, store),
    gestures: planGestures(PLAN_A, { ...raw, createEpic: null, reorderEpic: null }, store),
    controls: ADMIN_CONTROLS,
    surface: { kind: 'admin', planId: PLAN_A },
    home: planPath(PLAN_A),
    root: PLAN_A,
    routes: ADMIN_DRAWER_ROUTES,
    bridge: null,
    readItem: vi.fn<ItemRead>(),
    bindProject: null,
  }
}

// What draws the plan reads it through `usePlan`; the notice and the saving mark read the rest of the
// snapshot. A refusal said and then dismissed changes neither the plan nor anything drawn from it.
describe('usePlan, which is how the screen reads the plan', () => {
  it('re-renders nothing that reads it while only the saving mark and the notice change', async () => {
    const store = createPlanStore(planScreenModel(atlasPlan()))
    const session = sessionOver(store)
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <PlanSessionProvider value={session}>{children}</PlanSessionProvider>
    )
    let renders = 0
    renderHook(
      () => {
        renders += 1
        return usePlan()
      },
      { wrapper },
    )
    await act(async () => {
      await store.run({ apply: (plan) => plan, send: () => Promise.resolve({ ok: false, status: 409, detail: 'No.' }) })
    })
    act(() => store.dismiss())
    expect(renders).toBe(1)
  })

  it('re-renders what reads it when the plan itself changes', async () => {
    const store = createPlanStore(planScreenModel(atlasPlan()))
    const session = sessionOver(store)
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <PlanSessionProvider value={session}>{children}</PlanSessionProvider>
    )
    const { result } = renderHook(() => usePlan(), { wrapper })
    act(() => {
      void store.run({ apply: (plan) => ({ ...plan, name: 'Renamed' }), send: () => new Promise(() => undefined) })
    })
    expect(result.current.name).toBe('Renamed')
  })
})
