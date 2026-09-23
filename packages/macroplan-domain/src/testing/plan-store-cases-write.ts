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

/**
 * Registers the cases that assert what a **write** leaves behind: the two deletes, and the guards.
 *
 * The guards ride with the writes rather than sitting in a file of their own. A guard case drives
 * every method that takes a plan id — the two reads included — so it belongs to no one half, and one
 * case is not worth a fourth file; what it has in common with the deletes is that it is about a
 * mutation being refused before it lands. The reads file arranges with `saveItem` for the same kind
 * of reason: what a file here is named for is what its cases *assert*, never which methods they
 * call.
 */
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

  it('rejects a bad item id before publishing the manifest, so no delete is left half-applied', async () => {
    await fresh()
    await store.saveItem('macroplan', named([ITEM, KEPT]), itemDocument(ITEM))
    await store.saveItem('macroplan', named([ITEM, KEPT]), itemDocument(KEPT))
    for (const badId of BAD_IDS) {
      await expect(store.deleteItems('macroplan', named([]), [ITEM, badId])).rejects.toThrow(Invalid)
    }
    const left = await store.readManifest('macroplan', PLAN)
    expect(left?.items.map((one) => one.id)).toEqual([ITEM, KEPT])
    expect(await store.readItem('macroplan', PLAN, ITEM)).not.toBeNull()
    expect(await store.readItem('macroplan', PLAN, KEPT)).not.toBeNull()
  })
}
