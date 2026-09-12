import type { Folder } from '../entities/folder.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import type { TaskDocument } from '../entities/task.js'
import { emptyDocument } from '../entities/document.js'
import { NO_PROGRESS } from '../entities/progress.js'

/** The one timestamp every fixture carries, so no comparison depends on the clock. */
export const STAMP = '2026-09-10T00:00:00.000Z'

/**
 * Builds a ULID-shaped id whose head says what it is, so a failure names the entity it is about.
 *
 * A real `ulid()` makes a multi-entity fixture unreadable — several 26-character strings differing
 * only in a random tail — and nothing downstream needs entropy: `isUlid` is a pattern and not a
 * checksum, so a marked id satisfies it, and `projectDir()` and `taskFile()` alike. Indices pad on
 * the left, so ids built with one mark also sort in index order, which is what lets a test compare
 * a sorted collection against a literal.
 *
 * The mark has to stay inside Crockford base32 — `I`, `L`, `O` and `U` are **not** in it — or the
 * id is not a ULID and every guard in this package refuses it.
 */
export const marked = (mark: string, index: number): string =>
  `${mark}${String(index).padStart(26 - mark.length, '0')}`

/**
 * Builds a share-token-shaped credential, distinct per index.
 *
 * `isShareToken` is `/^[A-Za-z0-9_-]{16,64}$/` and import **refuses** a token failing it, that
 * check existing because nothing downstream of import ever re-checks a token. So a fixture token
 * that were merely "some string" would be blocked by the thing under test rather than by the thing
 * a test is about. Shaped like `sequentialIds().token()` for the same reason.
 */
export const token = (index: number): string => `tok_${String(index).padStart(16, '0')}`

/**
 * Builds a project-scoped `view` link in the project named, before overrides.
 *
 * `projectId` is a parameter rather than a default because a link's scope must resolve inside the
 * project it arrives with — `assertContained` and the import preview's scope check both say so —
 * and a fixture defaulting it would hand every caller the same project silently. `name` is
 * populated because the one name the contracts let be empty is a share link's, so a blank one is a
 * case to ask for rather than to inherit.
 */
export function shareLink(
  value: string,
  projectId: string,
  overrides: Partial<ShareLink> = {},
): ShareLink {
  return {
    token: value,
    name: 'Sam at ACME',
    role: 'view',
    scope: { kind: 'project', projectId },
    createdBy: null,
    createdAt: STAMP,
    ...overrides,
  }
}

/** Builds a folder at position 0, before overrides. Folders have no parent — they never nest. */
export function folder(id: string, name: string, overrides: Partial<Folder> = {}): Folder {
  return { id, name, position: 0, createdAt: STAMP, updatedAt: STAMP, ...overrides }
}

/**
 * Builds a manifest entry at position 0, in no folder, before overrides.
 *
 * Its cache describes exactly what {@link taskDocument} produces — one empty tab named General,
 * stamped {@link STAMP} — so an entry and a document built by these two fixtures agree and a
 * read of them writes nothing.
 */
export function taskEntry(id: string, name: string, overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id,
    name,
    position: 0,
    folderId: null,
    progress: NO_PROGRESS,
    updatedAt: STAMP,
    tabCount: 1,
    tabNames: ['General'],
    ...overrides,
  }
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
