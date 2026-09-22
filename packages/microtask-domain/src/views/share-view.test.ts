import { describe, expect, it } from 'vitest'
import type { ProjectScope, Role } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import { folder, manifest, taskEntry, STAMP } from '../testing/fixtures.js'
import { principalOf } from './view-mapper.js'
import { shareView } from './share-view.js'

const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const ELSEWHERE = '01M240ERCRWWCN16Q5AHP1FZAC'
const MINE = '01M240ERCRWWCN16Q5AHP1FZAB'
const SIBLING = '01M240ERCRWWCN16Q5AHP1FZAD'
const MY_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAG'
const OTHER_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAH'

const PROJECT_NAME = 'Hollowmere Migration'
const MY_FOLDER_NAME = 'Ashcombe hollowmere holdings'
const OTHER_FOLDER_NAME = 'Draypool hollowmere group'
const MY_TASK_NAME = 'Renew the hollowmere certificate'
const SIBLING_TASK_NAME = 'Audit the hollowmere invoices'

const WHOLE_PROJECT = 'shr_ptarmigan_wholeproject'
const READ_ONLY_SEAT = 'shr_ptarmigan_readonlyseat'
const OWN_TASK = 'shr_ptarmigan_owntaskonly'
const SIBLING_TASK = 'shr_ptarmigan_siblingtask'
const OTHER_PROJECT = 'shr_ptarmigan_otherproject'

const projectScope = (projectId: string): ProjectScope => ({ kind: 'project', projectId })
const taskScope = (taskId: string): ProjectScope => ({ kind: 'task', projectId: PROJECT, taskId })

const link = (token: string, role: Role, scope: ProjectScope): ShareLink => ({
  token,
  name: `Seat ${token}`,
  role,
  scope,
  createdBy: null,
  createdAt: STAMP,
})

const seed = (): ProjectManifest =>
  manifest(PROJECT, {
    name: PROJECT_NAME,
    folders: [
      folder(MY_FOLDER, MY_FOLDER_NAME),
      folder(OTHER_FOLDER, OTHER_FOLDER_NAME, { position: 1 }),
    ],
    tasks: [
      taskEntry(MINE, MY_TASK_NAME, { folderId: MY_FOLDER }),
      taskEntry(SIBLING, SIBLING_TASK_NAME, { folderId: OTHER_FOLDER, position: 1 }),
    ],
    shareLinks: [
      link(WHOLE_PROJECT, 'manage', projectScope(PROJECT)),
      link(READ_ONLY_SEAT, 'view', projectScope(PROJECT)),
      link(OWN_TASK, 'manage', taskScope(MINE)),
      link(SIBLING_TASK, 'view', taskScope(SIBLING)),
      link(OTHER_PROJECT, 'manage', projectScope(ELSEWHERE)),
    ],
  })

const namesOf = (rows: readonly { readonly name: string }[]): readonly string[] =>
  rows.map((each) => each.name)

describe('shareView tells a link what it is', () => {
  it('carries the role the link holds', () => {
    expect(shareView(seed(), link(OWN_TASK, 'manage', taskScope(MINE))).role).toBe('manage')
  })

  it('carries the scope the link is confined to, which no call can widen', () => {
    const view = shareView(seed(), link(OWN_TASK, 'manage', taskScope(MINE)))
    expect(view.scope).toEqual({ kind: 'task', projectId: PROJECT, taskId: MINE })
  })

  it('names the project the link lives in, which every scope may read', () => {
    const view = shareView(seed(), link(OWN_TASK, 'view', taskScope(MINE)))
    expect(view.project).toEqual({ id: PROJECT, name: PROJECT_NAME })
  })
})

describe('shareView tells a link what it can reach', () => {
  it('gives a project-scoped link every folder and task of the project', () => {
    const view = shareView(seed(), link(READ_ONLY_SEAT, 'view', projectScope(PROJECT)))
    expect(namesOf(view.folders)).toEqual([MY_FOLDER_NAME, OTHER_FOLDER_NAME])
    expect(namesOf(view.tasks)).toEqual([MY_TASK_NAME, SIBLING_TASK_NAME])
  })

  it('gives a task-scoped link its own task and no folders', () => {
    const view = shareView(seed(), link(OWN_TASK, 'manage', taskScope(MINE)))
    expect(namesOf(view.tasks)).toEqual([MY_TASK_NAME])
    expect(view.folders).toEqual([])
  })

  it('reaches by scope rather than by role, so a manage seat widens nothing', () => {
    const viewer = shareView(seed(), link(OWN_TASK, 'view', taskScope(MINE)))
    const manager = shareView(seed(), link(OWN_TASK, 'manage', taskScope(MINE)))
    expect(namesOf(manager.tasks)).toEqual(namesOf(viewer.tasks))
    expect(manager.folders).toEqual(viewer.folders)
  })

  it('never names a sibling task or any folder to a task-scoped link', () => {
    const serialised = JSON.stringify(shareView(seed(), link(OWN_TASK, 'manage', taskScope(MINE))))
    expect(serialised).not.toContain(SIBLING_TASK_NAME)
    expect(serialised).not.toContain(MY_FOLDER_NAME)
    expect(serialised).not.toContain(OTHER_FOLDER_NAME)
    expect(serialised).toContain(MY_TASK_NAME)
  })
})

describe('shareView carries no share token at all', () => {
  it('never includes the token of any other link, whatever role the caller holds', () => {
    const serialised = JSON.stringify(shareView(seed(), link(WHOLE_PROJECT, 'manage', projectScope(PROJECT))))
    expect(serialised).not.toContain(READ_ONLY_SEAT)
    expect(serialised).not.toContain(OWN_TASK)
    expect(serialised).not.toContain(SIBLING_TASK)
    expect(serialised).not.toContain(OTHER_PROJECT)
  })

  it('does not echo the caller own token either, since the caller already holds it', () => {
    const serialised = JSON.stringify(shareView(seed(), link(WHOLE_PROJECT, 'manage', projectScope(PROJECT))))
    expect(serialised).not.toContain(WHOLE_PROJECT)
  })

  it('carries no token-shaped string anywhere in it, for a manage seat over the project', () => {
    const serialised = JSON.stringify(shareView(seed(), link(WHOLE_PROJECT, 'manage', projectScope(PROJECT))))
    expect(serialised).not.toContain('shr_')
  })
})

describe('the principal a share link is turned into', () => {
  it('carries the link own role verbatim, so nothing is widened on the way in', () => {
    expect(principalOf(link(OWN_TASK, 'view', taskScope(MINE))).kind === 'link').toBe(true)
    expect(principalOf(link(OWN_TASK, 'view', taskScope(MINE)))).toEqual({
      kind: 'link',
      role: 'view',
      scope: { kind: 'task', projectId: PROJECT, taskId: MINE },
      token: OWN_TASK,
    })
  })

  it('carries a manage seat as manage, and a project scope as a project scope', () => {
    expect(principalOf(link(WHOLE_PROJECT, 'manage', projectScope(PROJECT)))).toEqual({
      kind: 'link',
      role: 'manage',
      scope: { kind: 'project', projectId: PROJECT },
      token: WHOLE_PROJECT,
    })
  })

  it('never derives an admin from a link, whatever authority the link carries', () => {
    expect(principalOf(link(WHOLE_PROJECT, 'manage', projectScope(PROJECT))).kind).toBe('link')
  })
})

describe('shareView is a pure function of its inputs', () => {
  it('leaves the manifest it was handed exactly as it found it', () => {
    const original = seed()
    const before = JSON.stringify(original)
    shareView(original, link(OWN_TASK, 'manage', taskScope(MINE)))
    expect(JSON.stringify(original)).toBe(before)
  })
})
