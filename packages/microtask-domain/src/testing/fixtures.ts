import type { Folder } from '../entities/folder.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'
import { emptyDocument } from '../entities/document.js'
import { NO_PROGRESS } from '../entities/progress.js'

/** The one timestamp every fixture carries, so no comparison depends on the clock. */
export const STAMP = '2026-09-10T00:00:00.000Z'

/** Builds a folder at position 0, before overrides. Folders have no parent — they never nest. */
export function folder(id: string, name: string, overrides: Partial<Folder> = {}): Folder {
  return { id, name, position: 0, createdAt: STAMP, updatedAt: STAMP, ...overrides }
}

/** Builds a manifest entry at position 0, in no folder, with no progress, before overrides. */
export function taskEntry(id: string, name: string, overrides: Partial<TaskEntry> = {}): TaskEntry {
  return { id, name, position: 0, folderId: null, progress: NO_PROGRESS, ...overrides }
}

/** Builds a task holding one empty tab, which is what a newly created task looks like. */
export function taskDocument(id: string, tabId: string): TaskDocument {
  return {
    id,
    createdAt: STAMP,
    updatedAt: STAMP,
    tabs: [
      { id: tabId, name: 'General', position: 0, document: emptyDocument(), createdAt: STAMP, updatedAt: STAMP },
    ],
  }
}

/** Builds a project manifest named Launch with no folders, tasks or share links, before overrides. */
export function manifest(id: string, overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    id,
    name: 'Launch',
    folders: [],
    tasks: [],
    shareLinks: [],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  }
}
