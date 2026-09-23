import { expect, it } from 'vitest'
import type { ItemDocument } from '../entities/item.js'
import type { PlanStoreHarness } from './plan-store-harness.js'
import { epic, item, itemDocument, marked, planManifest } from './fixtures.js'

const PLAN = marked('PN', 1)
const EPIC = marked('EP', 1)
const FEATURE = marked('FT', 1)
const ITEM = marked('TM', 1)

const withRail = () => planManifest(PLAN, { epics: [epic(EPIC, { name: 'Discovery' })] })

const withItem = () => planManifest(PLAN, { items: [item(ITEM, FEATURE)] })

const withBoth = () =>
  planManifest(PLAN, { epics: [epic(EPIC, { name: 'Discovery' })], items: [item(ITEM, FEATURE)] })

function renameInPlace(target: { readonly name: string } | undefined, name: string): void {
  if (!target) throw new Error('nothing to rename: the store did not hand back what it was given')
  const mutable = target as { name: string }
  mutable.name = name
}

function redescribeInPlace(target: ItemDocument | null, description: string): void {
  if (!target) throw new Error('nothing to edit: the store did not hand back what it was given')
  const mutable = target as { description: string }
  mutable.description = description
}

/**
 * Registers the copy cases, which are what make two adapters interchangeable.
 *
 * Each one mutates a value the store either handed over or was handed, and then reads again. A
 * manifest is reached through `epics[0]`, a **nested array element**, because a top-level field
 * would pass against a store that copied one level deep and kept the caller's arrays.
 *
 * A manifest goes in through **three** methods, not one, so the in-direction is pinned at all three.
 * Pinning `saveManifest` alone left the hole open: `saveItem` and `deleteItems` each take a manifest
 * too, and an adapter that serialised on the first path while retaining the caller's reference on
 * either of the others would have passed. The cases therefore hold the manifest they handed over and
 * mutate `epics[0]` after the call, which is the same shape as the `saveManifest` case and the same
 * reason for reaching into a nested array.
 *
 * An `ItemDocument` has no nested structure at all — four scalar fields — so its two cases mutate
 * `description`, which is the deepest thing there is to reach. They still bind the halves that
 * matter: a store handing back its own stored object fails the first, and a store keeping the
 * caller's object fails the second. When that entity grows a nested field, these two should follow
 * the manifest cases down into it.
 */
export function describePlanCopying(harness: PlanStoreHarness): void {
  const { store } = harness
  const fresh = async () => {
    await harness.reset()
  }

  it('copies a manifest deeply on the way out, so mutating a nested epic of the one it handed back cannot corrupt the store', async () => {
    await fresh()
    await store.saveManifest('macroplan', withRail())
    const handed = await store.readManifest('macroplan', PLAN)
    renameInPlace(handed?.epics[0], 'Corrupted')
    expect((await store.readManifest('macroplan', PLAN))?.epics[0]?.name).toBe('Discovery')
  })

  it('copies a manifest deeply on the way in, so a caller mutating a nested epic of what it saved cannot corrupt the store', async () => {
    await fresh()
    const saved = withRail()
    await store.saveManifest('macroplan', saved)
    renameInPlace(saved.epics[0], 'Corrupted')
    expect((await store.readManifest('macroplan', PLAN))?.epics[0]?.name).toBe('Discovery')
  })

  it('copies an item on the way out, so editing the document it handed back cannot corrupt the store', async () => {
    await fresh()
    await store.saveItem('macroplan', withItem(), itemDocument(ITEM, { description: 'As written' }))
    redescribeInPlace(await store.readItem('macroplan', PLAN, ITEM), 'Corrupted')
    expect((await store.readItem('macroplan', PLAN, ITEM))?.description).toBe('As written')
  })

  it('copies an item on the way in, so a caller editing the document it saved cannot corrupt the store', async () => {
    await fresh()
    const saved = itemDocument(ITEM, { description: 'As written' })
    await store.saveItem('macroplan', withItem(), saved)
    redescribeInPlace(saved, 'Corrupted')
    expect((await store.readItem('macroplan', PLAN, ITEM))?.description).toBe('As written')
  })

  it('copies the manifest saveItem was handed too, not only the one saveManifest was', async () => {
    await fresh()
    const saved = withBoth()
    await store.saveItem('macroplan', saved, itemDocument(ITEM))
    renameInPlace(saved.epics[0], 'Corrupted')
    expect((await store.readManifest('macroplan', PLAN))?.epics[0]?.name).toBe('Discovery')
  })

  it('copies the manifest deleteItems was handed too, which is the third way one goes in', async () => {
    await fresh()
    await store.saveItem('macroplan', withBoth(), itemDocument(ITEM))
    const saved = withRail()
    await store.deleteItems('macroplan', saved, [ITEM])
    renameInPlace(saved.epics[0], 'Corrupted')
    expect((await store.readManifest('macroplan', PLAN))?.epics[0]?.name).toBe('Discovery')
  })
}
