import { Invalid, NotFound } from '@repo/kernel'
import { emptyDocument } from '../entities/document.js'
import type { ProjectManifest } from '../entities/manifest.js'
import type { Tab } from '../entities/tab.js'
import type { TaskDocument } from '../entities/task.js'
import { densified, inOrder, numbered } from './positions.js'
import { taskCache } from './task-cache.js'
import { pickTask, withTask } from './task-mapper.js'

/** Finds one tab of a task, or throws NotFound. */
export function pickTab(task: TaskDocument, tabId: string): Tab {
  const found = task.tabs.find((tab) => tab.id === tabId)
  if (found === undefined) throw new NotFound('Tab not found')
  return found
}

/** Builds a tab holding an empty document, which is what a newly created tab starts with. */
export function newTab(id: string, name: string, position: number, stamp: string): Tab {
  return { id, name, position, document: emptyDocument(), createdAt: stamp, updatedAt: stamp }
}

/**
 * Puts a tab list back on a task, numbered `0..n-1` in the order given and stamped as changed.
 *
 * The renumbering is unconditional so no caller can leave a gap or a clash behind, and the stamp
 * belongs here because every path that reaches it has edited the task file.
 */
export function withTabs(task: TaskDocument, tabs: readonly Tab[], stamp: string): TaskDocument {
  return { ...task, tabs: numbered(tabs), updatedAt: stamp }
}

/** Replaces one tab, leaving every other tab where it is. */
export function withTab(task: TaskDocument, next: Tab, stamp: string): TaskDocument {
  const tabs = inOrder(task.tabs).map((tab) => (tab.id === next.id ? next : tab))
  return withTabs(task, tabs, stamp)
}

/**
 * The tabs left after dropping one, refusing to leave a task with none.
 *
 * A task with no tabs has nowhere to put its content and no tab for a reader to open, so the
 * last one is not removable; rename it instead. The tab must exist first, so removing an
 * unknown tab is NotFound even when the task holds only one.
 */
export function tabsWithout(task: TaskDocument, tabId: string): readonly Tab[] {
  pickTab(task, tabId)
  if (task.tabs.length <= 1) throw new Invalid('A task must keep at least one tab')
  return densified(task.tabs.filter((tab) => tab.id !== tabId))
}

/**
 * Refreshes the whole cache on the task's manifest entry from the task file (ADR 0007).
 *
 * All four fields at once, and the count spans the whole task rather than the tab that changed,
 * because that is the grain the manifest caches at. One operation writes them so that forgetting
 * one is forgetting all four (ADR 0034).
 */
export function withCache(manifest: ProjectManifest, task: TaskDocument): ProjectManifest {
  const entry = pickTask(manifest, task.id)
  return withTask(manifest, { ...entry, ...taskCache(task) })
}
