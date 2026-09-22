import { expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import type { PlanStore } from '../ports/plan-store.js'
import type { PlanStoreHarness } from './plan-store-harness.js'
import { item, itemDocument, marked, planManifest } from './fixtures.js'

const PLAN = marked('PN', 1)
const ABSENT = marked('PN', 9)
const FEATURE = marked('FT', 1)
const ITEM = marked('TM', 1)
const KEPT = marked('TM', 90)
const UNNAMED = marked('TM', 99)
const TWELVE = Array.from({ length: 12 }, (_, at) => marked('TM', at + 1))
const BAD_IDS = ['not-a-ulid', '../../etc/passwd', '']

const named = (ids: readonly string[]) =>
  planManifest(PLAN, { items: ids.map((id) => item(id, FEATURE)) })

const callsCarrying = (store: PlanStore, planId: string): readonly (() => Promise<unknown>)[] => [
  () => store.readManifest('macroplan', planId),
  () => store.readItem('macroplan', planId, KEPT),
  () => store.saveManifest('macroplan', planManifest(planId)),
  () => store.saveItem('macroplan', planManifest(planId), itemDocument(KEPT)),
  () => store.deleteItems('macroplan', planManifest(planId), [KEPT]),
  () => store.deletePlan('macroplan', planId),
]

/** Registers the writing half of the contract: the deletes, and the ULID guard on a plan id. */
export function describePlanWrites(harness: PlanStoreHarness): void {
  const { store } = harness
  const fresh = async () => {
    await harness.reset()
  }

  it('removes an item file and its manifest entry together', async () => {
    await fresh()
    await store.saveItem('macroplan', named([ITEM]), itemDocument(ITEM))
    await store.deleteItems('macroplan', named([]), [ITEM])
    expect(await store.readItem('macroplan', PLAN, ITEM)).toBeNull()
    expect((await store.readManifest('macroplan', PLAN))?.items).toEqual([])
  })

  it('removes twelve items and their twelve entries in one call, which is what deleting an epic is', async () => {
    await fresh()
    const full = named(TWELVE)
    for (const id of TWELVE) await store.saveItem('macroplan', full, itemDocument(id))
    await store.deleteItems('macroplan', named([]), TWELVE)
    for (const id of TWELVE) expect(await store.readItem('macroplan', PLAN, id)).toBeNull()
    expect((await store.readManifest('macroplan', PLAN))?.items).toEqual([])
  })

  it('removes the items it names and throws nothing over an id the plan does not name', async () => {
    await fresh()
    await store.saveItem('macroplan', named([ITEM, KEPT]), itemDocument(ITEM))
    await store.saveItem('macroplan', named([ITEM, KEPT]), itemDocument(KEPT))
    await store.deleteItems('macroplan', named([KEPT]), [ITEM, UNNAMED])
    expect(await store.readItem('macroplan', PLAN, ITEM)).toBeNull()
    expect(await store.readItem('macroplan', PLAN, KEPT)).not.toBeNull()
    const left = await store.readManifest('macroplan', PLAN)
    expect(left?.items.map((one) => one.id)).toEqual([KEPT])
  })

  it('removes a plan and everything under it, reporting that it existed', async () => {
    await fresh()
    await store.saveItem('macroplan', named([KEPT]), itemDocument(KEPT))
    expect(await store.deletePlan('macroplan', PLAN)).toBe(true)
    expect(await store.readManifest('macroplan', PLAN)).toBeNull()
    expect(await store.readItem('macroplan', PLAN, KEPT)).toBeNull()
    expect(await store.listManifests('macroplan')).toEqual([])
  })

  it('reports a plan that was never there as not deleted', async () => {
    await fresh()
    expect(await store.deletePlan('macroplan', ABSENT)).toBe(false)
  })

  it('rejects a plan id that is not a ULID, a traversal-shaped one included, from every method taking one', async () => {
    await fresh()
    for (const badId of BAD_IDS) {
      for (const call of callsCarrying(store, badId)) {
        await expect(call()).rejects.toThrow(Invalid)
      }
    }
  })
}
