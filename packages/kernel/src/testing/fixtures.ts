import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'
import { emptyDocument } from '../entities/document.js'
import { NO_PROGRESS } from '../entities/progress.js'

export const STAMP = '2026-09-10T00:00:00.000Z'

export function taskEntry(id: string, name: string, overrides: Partial<TaskEntry> = {}): TaskEntry {
  return { id, name, position: 0, folderId: null, progress: NO_PROGRESS, ...overrides }
}

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
