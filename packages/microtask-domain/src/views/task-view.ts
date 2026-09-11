import type { Principal } from '@repo/kernel'
import type { Folder } from '../entities/folder.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { Progress } from '../entities/progress.js'
import type { Tab } from '../entities/tab.js'
import type { TaskDocument } from '../entities/task.js'
import { countTabs } from '../progress.js'
import { pickTask } from '../services/task-mapper.js'
import { visibleTo } from './view-mapper.js'

/**
 * One task as a particular caller may be told about it: its entry, its tabs, and where it sits.
 *
 * `folder` is `null` for a caller the policy refuses a folder target — a task-scoped link, which
 * must not learn the name of the folder its task sits in because that name can itself identify
 * another client (ADR 0011). A task at the project root reads the same way, so the two are
 * indistinguishable from outside, which is the point.
 */
export interface TaskView {
  readonly projectId: string
  readonly id: string
  readonly name: string
  readonly position: number
  readonly folder: Folder | null
  readonly progress: Progress
  readonly tabs: readonly Tab[]
  readonly createdAt: string
  readonly updatedAt: string
}

const folderOf = (
  manifest: ProjectManifest,
  entry: TaskEntry,
  principal: Principal,
): Folder | null => {
  if (!visibleTo(principal, { kind: 'folder', projectId: manifest.id })) return null
  return manifest.folders.find((each) => each.id === entry.folderId) ?? null
}

/**
 * Shapes one task and its tab documents for whoever is asking.
 *
 * Progress is counted from the documents in hand rather than read from the manifest cache. The
 * document is the source of truth and the cache is only a cache (ADR 0007), and this view ships
 * the documents in the same payload — echoing a stale cache would contradict the checkboxes
 * beside it. There is still exactly one summation in the codebase: `countTabs`.
 *
 * Pure, and takes no lock, so a caller already inside one may use it.
 */
export function taskView(
  manifest: ProjectManifest,
  task: TaskDocument,
  principal: Principal,
): TaskView {
  const entry = pickTask(manifest, task.id)
  return {
    projectId: manifest.id,
    id: entry.id,
    name: entry.name,
    position: entry.position,
    folder: folderOf(manifest, entry, principal),
    progress: countTabs(task.tabs),
    tabs: task.tabs,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}
