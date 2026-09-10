import { describe, expect, it } from 'vitest'
import { Invalid, type Product } from '@repo/kernel'
import type { ProjectStore } from '../ports/project-store.js'
import { manifest, taskDocument, taskEntry } from './fixtures.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAB'
const T1 = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB1 = '01M240FB4GD6PF6V0PKZVF6FDA'

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

/** Runs the behaviour every ProjectStore adapter must exhibit. */
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

    it('deletes a task file and its manifest entry', async () => {
      await fresh()
      await store.saveTask('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Go-live')] }), taskDocument(T1, TAB1))
      await store.deleteTask('microtask', manifest(P1, { tasks: [] }), T1)
      expect(await store.readTask('microtask', P1, T1)).toBeNull()
      expect((await store.readManifest('microtask', P1))?.tasks).toEqual([])
    })

    it('treats a manifest entry with no task file as one unreadable task, not a broken project', async () => {
      await fresh()
      await store.saveManifest('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Ghost')] }))
      expect(await store.readTask('microtask', P1, T1)).toBeNull()
      expect((await store.readManifest('microtask', P1))?.tasks[0]?.name).toBe('Ghost')
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
      'leaves a container holding no project manifest out of the listing rather than failing the whole listing',
      async () => {
        await fresh()
        await store.saveManifest('microtask', manifest(P1))
        await harness.addContainerWithoutManifest?.('microtask', 'not-a-ulid')
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
