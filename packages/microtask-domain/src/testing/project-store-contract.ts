import { describe, expect, it } from 'vitest'
import { Invalid, type Product } from '@repo/kernel'
import type { ProjectStore } from '../ports/project-store.js'
import { manifest, taskDocument, taskEntry } from './fixtures.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAB'
const T1 = '01M240FB4GD6PF6V0PKZVF6FD9'
const T2 = '01M240FB4GD6PF6V0PKZVF6FDB'
const TAB1 = '01M240FB4GD6PF6V0PKZVF6FDA'
const TAB2 = '01M240FB4GD6PF6V0PKZVF6FDC'

/** The adapter under test, plus whatever setup that adapter can offer the contract. */
export interface StoreHarness {
  /** The adapter every case below runs against. */
  store: ProjectStore

  /** Discards all stored data, so each case starts from nothing. */
  reset(): Promise<void>

  /**
   * Stores content of the harness's choosing under a task's key, bypassing whatever encoding
   * the adapter uses, so the contract can prove that content the store cannot decode reads
   * back as null rather than throwing. Optional: an adapter with no way around its own
   * encoding skips that one case, which is preferable to widening ProjectStore with a write
   * method the application would never call.
   */
  writeUndecodableTask?(
    product: Product,
    projectId: string,
    taskId: string,
    raw: string,
  ): Promise<void>

  /**
   * Creates a project container named `name` holding no manifest, so the contract can prove
   * that listManifests leaves it out rather than failing. Optional for the same reason.
   */
  addContainerWithoutManifest?(product: Product, name: string): Promise<void>
}

function renameInPlace(target: { readonly name: string } | undefined, name: string): void {
  if (!target) throw new Error('nothing to rename: the store did not hand back what it was given')
  const mutable = target as { name: string }
  mutable.name = name
}

/**
 * Runs the behaviour every ProjectStore adapter must exhibit.
 *
 * **It does not bind `publishProject`'s headline promise.** Every case here is sequential, so
 * "wholly absent or wholly present" cannot be observed from inside one: `MemoryProjectStore` would
 * pass all four publish cases with no atomicity at all — it deletes, writes each task, then writes
 * the manifest, with no build area and no rename. What the cases do bind is the *observable
 * result*: the whole project lands, a task it does not name is gone, a bad document id destroys
 * nothing, and a project with no tasks is publishable. Atomicity is asserted where it lives, in
 * `fs-project-store.ordering.test.ts` against `FsProjectStore` over a `FileSystem` that dies on
 * the rename, and again through the composed API. A contract case would need a harness hook for
 * "interrupt the publish", which is the kind of adapter-specific probe this file keeps optional.
 *
 * **Which step of a publish died is deliberately not a contract case either.** `FsProjectStore`
 * distinguishes three — a build write, the clear of the destination, and the rename — because on
 * a filesystem they leave the project that was there untouched, partly removed, and gone
 * respectively, and an operator has to be told which. `MemoryProjectStore` has no such steps: its
 * clear is one map operation that cannot fail partway, so there is nothing for it to agree with.
 * The two adapters do not share that behaviour because they do not share the failure mode, and a
 * case asserting it would be asserting `FsProjectStore` twice under a name that claims otherwise.
 *
 * One other difference the cases cannot pin: `MemoryProjectStore` validates every document id up
 * front, where `FsProjectStore` validates lazily as it builds each task path. Both leave the
 * project that was there untouched — which is the case below — but the filesystem adapter will
 * have written the earlier task files into its build directory first, and reclaims them on the
 * next publish of that id rather than immediately.
 */
export function describeProjectStore(name: string, makeHarness: () => StoreHarness): void {
  describe(`${name} — ProjectStore contract`, () => {
    const harness = makeHarness()
    const { store } = harness

    const fresh = async () => {
      await harness.reset()
    }

    it('returns null for a project that was never written', async () => {
      await fresh()
      expect(await store.readManifest('microtask', P1)).toBeNull()
    })

    it('round-trips a manifest', async () => {
      await fresh()
      const m = manifest(P1, { name: 'Discovery' })
      await store.saveManifest('microtask', m)
      expect(await store.readManifest('microtask', P1)).toEqual(m)
    })

    it('round-trips a task and its manifest entry together', async () => {
      await fresh()
      const task = taskDocument(T1, TAB1)
      const m = manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] })
      await store.saveTask('microtask', m, task)
      expect(await store.readTask('microtask', P1, T1)).toEqual(task)
      expect((await store.readManifest('microtask', P1))?.tasks[0]?.name).toBe('Go-live')
    })

    it('makes the product part of a project identity, so the same id under another product reads back as absent', async () => {
      await fresh()
      await store.saveManifest('microtask', manifest(P1, { name: 'Mine' }))
      expect(await store.readManifest('macroplan', P1)).toBeNull()
    })

    it('lists manifests newest update first', async () => {
      await fresh()
      await store.saveManifest('microtask', manifest(P1, { updatedAt: '2026-01-01T00:00:00.000Z' }))
      await store.saveManifest('microtask', manifest(P2, { updatedAt: '2026-06-01T00:00:00.000Z' }))
      expect((await store.listManifests('microtask')).map((m) => m.id)).toEqual([P2, P1])
    })

    it('deletes a task and its manifest entry together', async () => {
      await fresh()
      await store.saveTask('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] }), taskDocument(T1, TAB1))
      await store.deleteTask('microtask', manifest(P1, { tasks: [] }), T1)
      expect(await store.readTask('microtask', P1, T1)).toBeNull()
      expect((await store.readManifest('microtask', P1))?.tasks).toEqual([])
    })

    it('treats a manifest entry whose task is gone as one unreadable task, not a broken project', async () => {
      await fresh()
      await store.saveManifest('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Ghost')] }))
      expect(await store.readTask('microtask', P1, T1)).toBeNull()
      expect((await store.readManifest('microtask', P1))?.tasks[0]?.name).toBe('Ghost')
    })

    it('publishes a whole project, manifest and every task together', async () => {
      await fresh()
      const whole = manifest(P1, { tasks: [taskEntry(T1, 'Go-live'), taskEntry(T2, 'Cost it')] })
      await store.publishProject('microtask', {
        manifest: whole,
        documents: [taskDocument(T1, TAB1), taskDocument(T2, TAB2)],
      })
      expect((await store.readManifest('microtask', P1))?.tasks.map((one) => one.id)).toEqual([T1, T2])
      expect(await store.readTask('microtask', P1, T1)).not.toBeNull()
      expect(await store.readTask('microtask', P1, T2)).not.toBeNull()
    })

    it('drops a task the published project does not name, a publish being a replace and not a merge', async () => {
      await fresh()
      await store.saveTask('microtask', manifest(P1, { tasks: [taskEntry(T2, 'Leftover')] }), taskDocument(T2, TAB2))
      const whole = manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] })
      await store.publishProject('microtask', { manifest: whole, documents: [taskDocument(T1, TAB1)] })
      expect((await store.readManifest('microtask', P1))?.tasks.map((one) => one.id)).toEqual([T1])
      expect(await store.readTask('microtask', P1, T2)).toBeNull()
    })

    it('refuses a document whose id is not a ULID without destroying the project already there', async () => {
      await fresh()
      const live = manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] })
      await store.saveTask('microtask', live, taskDocument(T1, TAB1))
      const broken = manifest(P1, { tasks: [taskEntry(T2, 'Incoming')] })
      await expect(
        store.publishProject('microtask', {
          manifest: broken,
          documents: [{ ...taskDocument(T2, TAB2), id: 'not-a-ulid' }],
        }),
      ).rejects.toThrow(Invalid)
      expect((await store.readManifest('microtask', P1))?.tasks.map((one) => one.id)).toEqual([T1])
      expect(await store.readTask('microtask', P1, T1)).not.toBeNull()
    })

    it('publishes a project holding no task at all, which a legacy file with no tabs converts to', async () => {
      await fresh()
      await store.publishProject('microtask', { manifest: manifest(P1), documents: [] })
      expect((await store.readManifest('microtask', P1))?.tasks).toEqual([])
      expect((await store.listManifests('microtask')).map((one) => one.id)).toEqual([P1])
    })

    it('removes a project and everything under it', async () => {
      await fresh()
      await store.saveTask('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] }), taskDocument(T1, TAB1))
      expect(await store.deleteProject('microtask', P1)).toBe(true)
      expect(await store.readManifest('microtask', P1)).toBeNull()
      expect(await store.readTask('microtask', P1, T1)).toBeNull()
    })

    it('reports a project that was never there as not deleted', async () => {
      await fresh()
      expect(await store.deleteProject('microtask', P2)).toBe(false)
    })

    it('rejects any project id that is not a ULID, a traversal-shaped one included, since a store with no paths can promise nothing more', async () => {
      await fresh()
      await expect(store.readManifest('microtask', 'not-a-ulid')).rejects.toThrow(Invalid)
      await expect(store.readManifest('microtask', '../../etc/passwd')).rejects.toThrow(Invalid)
    })

    it.skipIf(!harness.writeUndecodableTask)(
      'reads content it cannot decode back as null rather than throwing, so one corrupt task is not a broken project',
      async () => {
        await fresh()
        await store.saveManifest('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Corrupt')] }))
        await harness.writeUndecodableTask?.('microtask', P1, T1, '{ "tabs": [ truncated')
        expect(await store.readTask('microtask', P1, T1)).toBeNull()
        expect((await store.readManifest('microtask', P1))?.tasks[0]?.name).toBe('Corrupt')
      },
    )

    it.skipIf(!harness.addContainerWithoutManifest)(
      'leaves a container whose name could never be a project id out of the listing',
      async () => {
        await fresh()
        await store.saveManifest('microtask', manifest(P1))
        await harness.addContainerWithoutManifest?.('microtask', 'not-a-ulid')
        expect((await store.listManifests('microtask')).map((m) => m.id)).toEqual([P1])
      },
    )

    it.skipIf(!harness.addContainerWithoutManifest)(
      'leaves a container named like a project but holding no manifest out of the listing',
      async () => {
        await fresh()
        await store.saveManifest('microtask', manifest(P1))
        await harness.addContainerWithoutManifest?.('microtask', P2)
        expect((await store.listManifests('microtask')).map((m) => m.id)).toEqual([P1])
      },
    )

    it('copies a manifest deeply on the way out, so mutating a nested entry of the one it handed back cannot corrupt the store', async () => {
      await fresh()
      await store.saveManifest('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] }))
      const handed = await store.readManifest('microtask', P1)
      renameInPlace(handed?.tasks[0], 'Corrupted')
      expect((await store.readManifest('microtask', P1))?.tasks[0]?.name).toBe('Go-live')
    })

    it('copies a manifest deeply on the way in, so a caller mutating a nested entry of what it saved cannot corrupt the store', async () => {
      await fresh()
      const saved = manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] })
      await store.saveManifest('microtask', saved)
      renameInPlace(saved.tasks[0], 'Corrupted')
      expect((await store.readManifest('microtask', P1))?.tasks[0]?.name).toBe('Go-live')
    })

    it('copies a task deeply on the way out, so mutating a nested tab of the one it handed back cannot corrupt the store', async () => {
      await fresh()
      const entry = manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] })
      await store.saveTask('microtask', entry, taskDocument(T1, TAB1))
      const handed = await store.readTask('microtask', P1, T1)
      renameInPlace(handed?.tabs[0], 'Corrupted')
      expect((await store.readTask('microtask', P1, T1))?.tabs[0]?.name).toBe('General')
    })

    it('copies a task deeply on the way in, so a caller mutating a nested tab of what it saved cannot corrupt the store', async () => {
      await fresh()
      const task = taskDocument(T1, TAB1)
      await store.saveTask('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] }), task)
      renameInPlace(task.tabs[0], 'Corrupted')
      expect((await store.readTask('microtask', P1, T1))?.tabs[0]?.name).toBe('General')
    })
  })
}
