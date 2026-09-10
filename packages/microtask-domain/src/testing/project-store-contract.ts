import { describe, expect, it } from 'vitest'
import type { ProjectStore } from '../ports/project-store.js'
import { manifest, taskDocument, taskEntry } from './fixtures.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAB'
const T1 = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB1 = '01M240FB4GD6PF6V0PKZVF6FDA'

export interface StoreHarness {
  store: ProjectStore
  reset(): Promise<void>
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

    it('keeps products in separate data roots', async () => {
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

    it('rejects an identifier that is not a ULID', async () => {
      await fresh()
      await expect(store.readManifest('microtask', '../../etc/passwd')).rejects.toThrow()
    })
  })
}
