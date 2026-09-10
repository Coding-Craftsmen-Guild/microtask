import { NotFound } from '@repo/kernel'
import { emptyDocument } from '../entities/document.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'
import { densified, inOrder, numbered } from './positions.js'

const inGroup = (task: TaskEntry, folderId: string | null): boolean => task.folderId === folderId

/** Finds one task's manifest entry, or throws NotFound. */
export function pickTask(manifest: ProjectManifest, taskId: string): TaskEntry {
  const found = manifest.tasks.find((task) => task.id === taskId)
  if (found === undefined) throw new NotFound('Task not found')
  return found
}

/**
 * Throws NotFound unless the project has that folder. `null` names the project root, which
 * always exists, so it is the one folder id that never has to be looked up.
 */
export function assertFolder(manifest: ProjectManifest, folderId: string | null): void {
  if (folderId === null) return
  if (!manifest.folders.some((folder) => folder.id === folderId)) {
    throw new NotFound('Folder not found')
  }
}

/** The tasks filed under one folder — `null` being the project root — in order. */
export function groupOf(
  tasks: readonly TaskEntry[],
  folderId: string | null,
): readonly TaskEntry[] {
  return inOrder(tasks.filter((task) => inGroup(task, folderId)))
}

/** Puts one folder's tasks back, in the order given, leaving every other folder alone. */
export function withGroup(
  tasks: readonly TaskEntry[],
  folderId: string | null,
  group: readonly TaskEntry[],
): readonly TaskEntry[] {
  return [...tasks.filter((task) => !inGroup(task, folderId)), ...numbered(group)]
}

/** Replaces one task's entry, leaving every other task where it is. */
export function withTask(manifest: ProjectManifest, next: TaskEntry): ProjectManifest {
  return { ...manifest, tasks: manifest.tasks.map((task) => (task.id === next.id ? next : task)) }
}

/** Drops one task and closes the gap it leaves in the group it was in. */
export function without(tasks: readonly TaskEntry[], task: TaskEntry): readonly TaskEntry[] {
  const others = tasks.filter((other) => other.id !== task.id)
  return [
    ...others.filter((other) => !inGroup(other, task.folderId)),
    ...densified(groupOf(others, task.folderId)),
  ]
}

/**
 * Moves one task into a folder, appending it at the end of that folder's order and closing the
 * gap it leaves behind, so both groups stay a dense `0..n-1` range. Nothing but `folderId` and
 * the positions changes.
 */
export function movedTo(
  tasks: readonly TaskEntry[],
  task: TaskEntry,
  folderId: string | null,
): readonly TaskEntry[] {
  const remaining = without(tasks, task)
  const joined = [...groupOf(remaining, folderId), { ...task, folderId }]
  return withGroup(remaining, folderId, joined)
}

/**
 * The document a new task starts with: one tab named `General` holding an empty document,
 * matching what the app being replaced gives a new project.
 */
export function newTaskDocument(id: string, tabId: string, stamp: string): TaskDocument {
  return {
    id,
    createdAt: stamp,
    updatedAt: stamp,
    tabs: [
      {
        id: tabId,
        name: 'General',
        position: 0,
        document: emptyDocument(),
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
  }
}
