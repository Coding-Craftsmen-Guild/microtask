import { describe, expect, it } from 'vitest'
import * as contracts from '@repo/contracts'
import { emptyDocument, type DocumentJson } from './document.js'
import { NO_PROGRESS, type Progress } from './progress.js'
import type { Folder } from './folder.js'
import type { ShareLink } from './share-link.js'
import type { Tab } from './tab.js'
import type { TaskDocument } from './task.js'
import type { ProjectManifest, TaskEntry } from './manifest.js'

type Parsed<Schema extends { parse: (input: unknown) => unknown }> = ReturnType<Schema['parse']>

type Immutable<T> = T extends readonly (infer Element)[]
  ? readonly Immutable<Element>[]
  : T extends object
    ? { readonly [K in keyof T]: Immutable<T[K]> }
    : T

type MatchesContract<Entity extends Immutable<Output>, Output> = Entity

type Checked = readonly [
  MatchesContract<Folder, Parsed<typeof contracts.Folder>>,
  MatchesContract<Tab, Parsed<typeof contracts.Tab>>,
  MatchesContract<TaskEntry, Parsed<typeof contracts.TaskEntry>>,
  MatchesContract<TaskDocument, Parsed<typeof contracts.TaskDocument>>,
  MatchesContract<ShareLink, Parsed<typeof contracts.ShareLink>>,
  MatchesContract<ProjectManifest, Parsed<typeof contracts.ProjectManifest>>,
  MatchesContract<Progress, Parsed<typeof contracts.Progress>>,
  MatchesContract<DocumentJson, Parsed<typeof contracts.DocumentJson>>,
]

const TOKEN = 'yjKq3Zc1vHt8Lm0Pw5Rb2Nd7'
const ID = '01M240ERCRWWCN16Q5AHP1FZAQ'
const STAMP = '2026-09-10T00:00:00.000Z'

const shareLink: ShareLink = {
  token: TOKEN,
  name: 'Client',
  role: 'write',
  scope: { kind: 'project', projectId: ID },
  createdBy: null,
  createdAt: STAMP,
}

const tab: Tab = {
  id: ID,
  name: 'General',
  position: 0,
  document: emptyDocument(),
  createdAt: STAMP,
  updatedAt: STAMP,
}

const populated: ProjectManifest = {
  id: ID,
  name: 'Launch',
  folders: [{ id: ID, name: 'Phase one', position: 0, createdAt: STAMP, updatedAt: STAMP }],
  tasks: [{ id: ID, name: 'Go-live', position: 0, folderId: ID, progress: NO_PROGRESS }],
  shareLinks: [shareLink],
  createdAt: STAMP,
  updatedAt: STAMP,
}

describe('entities and contracts describe the same shapes', () => {
  it('keeps every stored entity assignable to the output of the schema that will serve it', () => {
    const proof: Checked | null = null
    expect(proof).toBeNull()
  })

  it('parses a fully populated manifest, which the type check alone cannot prove because a zod refinement does not reach the inferred type', () => {
    const parsed = contracts.ProjectManifest.safeParse(populated)
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('parses a task document with a tab, so a nested shape cannot drift unseen either', () => {
    const document: TaskDocument = { id: ID, tabs: [tab], createdAt: STAMP, updatedAt: STAMP }
    expect(contracts.TaskDocument.safeParse(document).error?.issues ?? []).toEqual([])
  })
})
