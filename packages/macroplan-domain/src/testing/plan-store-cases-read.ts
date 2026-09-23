import { expect, it } from 'vitest'
import type { PlanStoreHarness } from './plan-store-harness.js'
import { item, itemDocument, marked, planManifest } from './fixtures.js'

const PLAN = marked('PN', 1)
const OTHER = marked('PN', 2)
const FEATURE = marked('FT', 1)
const ITEM = marked('TM', 1)
const TRUNCATED = '{ "epics": [ truncated'
const SAME_STAMP = '2026-04-01T00:00:00.000Z'

/**
 * Registers the cases that assert what a **read** answers: round trips, listing order, absence.
 *
 * Several of them write first, `saveItem` included, because a read has to be given something to
 * read. That is arranging and not asserting, which is the line the three case files are divided on:
 * none of them is a half of the port, and none owns a method.
 */
export function describePlanReads(harness: PlanStoreHarness): void {
  const { store } = harness
  const fresh = async () => {
    await harness.reset()
  }

  it('returns null for a plan that was never written', async () => {
    await fresh()
    expect(await store.readManifest('macroplan', PLAN)).toBeNull()
  })

  it('round-trips a manifest', async () => {
    await fresh()
    const saved = planManifest(PLAN, { name: 'Discovery' })
    await store.saveManifest('macroplan', saved)
    expect(await store.readManifest('macroplan', PLAN)).toEqual(saved)
  })

  it('round-trips an item file and its manifest entry together', async () => {
    await fresh()
    const document = itemDocument(ITEM, { description: 'Wire it up' })
    const manifest = planManifest(PLAN, { items: [item(ITEM, FEATURE, { name: 'The form' })] })
    await store.saveItem('macroplan', manifest, document)
    expect(await store.readItem('macroplan', PLAN, ITEM)).toEqual(document)
    expect((await store.readManifest('macroplan', PLAN))?.items[0]?.name).toBe('The form')
  })

  it('makes the product part of a plan identity, so the same id under microtask reads back absent', async () => {
    await fresh()
    await store.saveManifest('macroplan', planManifest(PLAN, { name: 'Mine' }))
    expect(await store.readManifest('microtask', PLAN)).toBeNull()
  })

  it('lists manifests newest update first', async () => {
    await fresh()
    await store.saveManifest(
      'macroplan',
      planManifest(PLAN, { updatedAt: '2026-06-01T00:00:00.000Z' }),
    )
    await store.saveManifest(
      'macroplan',
      planManifest(OTHER, { updatedAt: '2026-01-01T00:00:00.000Z' }),
    )
    expect((await store.listManifests('macroplan')).map((found) => found.id)).toEqual([PLAN, OTHER])
  })

  it('breaks a tie on updatedAt by descending id, so no adapter is left to answer with its own directory order', async () => {
    await fresh()
    await store.saveManifest('macroplan', planManifest(PLAN, { updatedAt: SAME_STAMP }))
    await store.saveManifest('macroplan', planManifest(OTHER, { updatedAt: SAME_STAMP }))
    expect((await store.listManifests('macroplan')).map((found) => found.id)).toEqual([OTHER, PLAN])
  })

  it('treats a manifest entry whose item file is gone as one unreadable item, not a broken plan', async () => {
    await fresh()
    await store.saveManifest(
      'macroplan',
      planManifest(PLAN, { items: [item(ITEM, FEATURE, { name: 'Ghost' })] }),
    )
    expect(await store.readItem('macroplan', PLAN, ITEM)).toBeNull()
    expect((await store.readManifest('macroplan', PLAN))?.items[0]?.name).toBe('Ghost')
  })

  it.skipIf(!harness.writeUndecodableManifest)(
    'reads a manifest it cannot decode back as null rather than throwing',
    async () => {
      await fresh()
      await harness.writeUndecodableManifest?.('macroplan', PLAN, TRUNCATED)
      expect(await store.readManifest('macroplan', PLAN)).toBeNull()
    },
  )

  it.skipIf(!harness.writeUndecodableManifest)(
    'leaves a plan whose manifest it cannot decode out of the listing, so it is absent and not damaged',
    async () => {
      await fresh()
      await store.saveManifest('macroplan', planManifest(OTHER))
      await harness.writeUndecodableManifest?.('macroplan', PLAN, TRUNCATED)
      expect((await store.listManifests('macroplan')).map((found) => found.id)).toEqual([OTHER])
    },
  )

  it.skipIf(!harness.writeUndecodableItem)(
    'reads an item it cannot decode back as null, so one corrupt item is not a broken plan',
    async () => {
      await fresh()
      await store.saveManifest(
        'macroplan',
        planManifest(PLAN, { items: [item(ITEM, FEATURE, { name: 'Corrupt' })] }),
      )
      await harness.writeUndecodableItem?.('macroplan', PLAN, ITEM, '{ "description": tru')
      expect(await store.readItem('macroplan', PLAN, ITEM)).toBeNull()
      expect((await store.readManifest('macroplan', PLAN))?.items[0]?.name).toBe('Corrupt')
    },
  )

  it.skipIf(!harness.addContainerWithoutManifest)(
    'leaves a container named like a plan but holding no manifest out of the listing',
    async () => {
      await fresh()
      await store.saveManifest('macroplan', planManifest(PLAN))
      await harness.addContainerWithoutManifest?.('macroplan', OTHER)
      expect((await store.listManifests('macroplan')).map((found) => found.id)).toEqual([PLAN])
    },
  )

  it.skipIf(!harness.addContainerWithoutManifest)(
    'leaves a container whose name could never be a plan id out of the listing',
    async () => {
      await fresh()
      await store.saveManifest('macroplan', planManifest(PLAN))
      await harness.addContainerWithoutManifest?.('macroplan', 'not-a-ulid')
      expect((await store.listManifests('macroplan')).map((found) => found.id)).toEqual([PLAN])
    },
  )
}
