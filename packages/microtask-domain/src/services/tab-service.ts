import { Conflict, NotFound, type Product } from '@repo/kernel'
import { assertSafeDocument } from '../document-guard.js'
import type { ProjectManifest } from '../entities/manifest.js'
import type { Tab } from '../entities/tab.js'
import type { TaskDocument } from '../entities/task.js'
import { assertWithin, cleanName } from '../limits.js'
import type { ServiceContext } from './context.js'
import { inOrder, reordered } from './positions.js'
import { pickTask } from './task-mapper.js'
import { newTab, pickTab, tabsWithout, withProgress, withTab, withTabs } from './tab-mapper.js'

/**
 * Which task a tab operation addresses.
 *
 * Every method here names a task and then something inside it, which is already four values
 * before any payload; grouping the address keeps each signature within the parameter cap
 * ADR 0027 sets, and keeps "which task" one thing rather than three.
 */
export interface TaskRef {
  readonly product: Product
  readonly projectId: string
  readonly taskId: string
}

interface Loaded {
  readonly manifest: ProjectManifest
  readonly task: TaskDocument
}

/**
 * The tabs of one task, and the conditional writes that keep two editors from losing work.
 *
 * Every method here edits the task file, so every one of them takes the lock and stamps the
 * project as changed; there is no read path to keep lock-free. `writeDocument` is the reason
 * the lock is a correctness requirement rather than a convenience: its read → compare → write
 * cycle only rejects a stale write if nothing can interleave inside it (ADR 0016, ADR 0006).
 */
export class TabService {
  readonly #ctx: ServiceContext

  /** Creates the service over an injected context. */
  constructor(ctx: ServiceContext) {
    this.#ctx = ctx
  }

  /** Creates a tab at the end of the task's order, refusing to exceed the per-task cap. */
  async create(at: TaskRef, name: string): Promise<Tab> {
    const cleaned = cleanName(name)
    return this.#ctx.lock.run(async () => {
      const { manifest, task } = await this.#load(at)
      assertWithin('tabsPerTask', task.tabs.length)
      const stamp = this.#ctx.clock.now()
      const created = newTab(this.#ctx.ids.entityId(), cleaned, task.tabs.length, stamp)
      await this.#write(at, manifest, withTabs(task, [...inOrder(task.tabs), created], stamp))
      return created
    })
  }

  /** Renames a tab, leaving its document and its place in the order alone. */
  async rename(at: TaskRef, tabId: string, name: string): Promise<Tab> {
    const cleaned = cleanName(name)
    return this.#ctx.lock.run(async () => {
      const { manifest, task } = await this.#load(at)
      const stamp = this.#ctx.clock.now()
      const next: Tab = { ...pickTab(task, tabId), name: cleaned, updatedAt: stamp }
      await this.#write(at, manifest, withTab(task, next, stamp))
      return next
    })
  }

  /** Removes a tab, unless it is the only one the task has left. */
  async remove(at: TaskRef, tabId: string): Promise<void> {
    await this.#ctx.lock.run(async () => {
      const { manifest, task } = await this.#load(at)
      const stamp = this.#ctx.clock.now()
      await this.#write(at, manifest, withTabs(task, tabsWithout(task, tabId), stamp))
    })
  }

  /** Renumbers the task's tabs into the order given, which must name each of them exactly once. */
  async reorder(at: TaskRef, tabIds: readonly string[]): Promise<readonly Tab[]> {
    return this.#ctx.lock.run(async () => {
      const { manifest, task } = await this.#load(at)
      const stamp = this.#ctx.clock.now()
      const tabs = reordered(task.tabs, tabIds, 'tab')
      await this.#write(at, manifest, withTabs(task, tabs, stamp))
      return tabs
    })
  }

  /**
   * Replaces a tab's document if it has not changed since `expectedUpdatedAt`, returning the
   * stamp the next write must carry (ADR 0016).
   *
   * The document is checked before anything is read, so unsafe content is refused whether or
   * not the tab it names exists. Everything after that — read, compare, write — runs inside the
   * lock, because a comparison that another write can interleave with rejects nothing.
   */
  async writeDocument(
    at: TaskRef,
    tabId: string,
    document: unknown,
    expectedUpdatedAt: string,
  ): Promise<string> {
    assertSafeDocument(document)
    return this.#ctx.lock.run(async () => {
      const { manifest, task } = await this.#load(at)
      const current = pickTab(task, tabId)
      if (current.updatedAt !== expectedUpdatedAt) {
        throw new Conflict('This tab changed elsewhere')
      }
      const stamp = this.#ctx.clock.now()
      const next: Tab = { ...current, document, updatedAt: stamp }
      await this.#write(at, manifest, withTab(task, next, stamp))
      return stamp
    })
  }

  /** Reads a task's manifest and document together. Takes no lock, so a locked caller may use it. */
  async #load(at: TaskRef): Promise<Loaded> {
    const manifest = await this.#ctx.store.readManifest(at.product, at.projectId)
    if (manifest === null) throw new NotFound('Project not found')
    pickTask(manifest, at.taskId)
    const task = await this.#ctx.store.readTask(at.product, at.projectId, at.taskId)
    if (task === null) throw new NotFound('Task not found')
    return { manifest, task }
  }

  /**
   * Writes the task and then the manifest, refreshing the progress cache and stamping the
   * project. Every caller has edited the task file, so every one of them stamps.
   */
  async #write(at: TaskRef, manifest: ProjectManifest, task: TaskDocument): Promise<void> {
    const next = { ...withProgress(manifest, task), updatedAt: this.#ctx.clock.now() }
    await this.#ctx.store.saveTask(at.product, next, task)
  }
}
