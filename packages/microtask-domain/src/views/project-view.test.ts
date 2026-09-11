import { describe, expect, it } from 'vitest'
import { can, type Principal, type Role, type Scope } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import { folder, manifest, taskEntry, STAMP } from '../testing/fixtures.js'
import { clearance, visibleTo } from './view-mapper.js'
import { projectView } from './project-view.js'

const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const ELSEWHERE = '01M240ERCRWWCN16Q5AHP1FZAC'
const MINE = '01M240ERCRWWCN16Q5AHP1FZAB'
const SIBLING = '01M240ERCRWWCN16Q5AHP1FZAD'
const MY_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAG'
const OTHER_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAH'

const CHANGED = '2026-09-11T08:30:00.000Z'

const PROJECT_NAME = 'Hollowmere Migration'
const MY_FOLDER_NAME = 'Ashcombe hollowmere holdings'
const OTHER_FOLDER_NAME = 'Draypool hollowmere group'
const MY_TASK_NAME = 'Renew the hollowmere certificate'
const SIBLING_TASK_NAME = 'Audit the hollowmere invoices'

const WHOLE_PROJECT = 'shr_ptarmigan_wholeproject'
const READ_ONLY_SEAT = 'shr_ptarmigan_readonlyseat'
const OWN_TASK = 'shr_ptarmigan_owntaskonly'
const TASK_SEAT = 'shr_ptarmigan_taskviewseat'
const SIBLING_TASK = 'shr_ptarmigan_siblingtask'
const OTHER_PROJECT = 'shr_ptarmigan_otherproject'

const projectScope = (projectId: string): Scope => ({ kind: 'project', projectId })
const taskScope = (taskId: string): Scope => ({ kind: 'task', projectId: PROJECT, taskId })

const link = (token: string, role: Role, scope: Scope): ShareLink => ({
  token,
  name: `Seat ${token}`,
  role,
  scope,
  createdBy: null,
  createdAt: STAMP,
})

const admin: Principal = { kind: 'admin' }

const holder = (token: string, role: Role, scope: Scope): Principal => ({
  kind: 'link',
  role,
  scope,
  token,
})

const projectHolder = (role: Role, token = WHOLE_PROJECT): Principal =>
  holder(token, role, projectScope(PROJECT))

const taskHolder = (role: Role, token = OWN_TASK): Principal =>
  holder(token, role, taskScope(MINE))

const seed = (): ProjectManifest =>
  manifest(PROJECT, {
    name: PROJECT_NAME,
    updatedAt: CHANGED,
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
      link(TASK_SEAT, 'view', taskScope(MINE)),
      link(SIBLING_TASK, 'view', taskScope(SIBLING)),
      link(OTHER_PROJECT, 'manage', projectScope(ELSEWHERE)),
    ],
  })

const tokensOf = (links: readonly ShareLink[] | undefined): readonly string[] =>
  (links ?? []).map((each) => each.token)

const namesOf = (rows: readonly { readonly name: string }[]): readonly string[] =>
  rows.map((each) => each.name)

describe('projectView names the project for everyone who may read it', () => {
  it('carries the project id, name and stamps for an admin', () => {
    const view = projectView(seed(), admin)
    expect(view.id).toBe(PROJECT)
    expect(view.name).toBe(PROJECT_NAME)
    expect(view.createdAt).toBe(STAMP)
    expect(view.updatedAt).toBe(CHANGED)
  })

  it('still names the project to a task-scoped holder, which project:read allows it', () => {
    expect(projectView(seed(), taskHolder('view')).name).toBe(PROJECT_NAME)
  })
})

describe('projectView and the folder tree', () => {
  it('gives an admin every folder in the project', () => {
    expect(namesOf(projectView(seed(), admin).folders)).toEqual([
      MY_FOLDER_NAME,
      OTHER_FOLDER_NAME,
    ])
  })

  it('gives a project-scoped view holder every folder, since project:read reaches them', () => {
    expect(namesOf(projectView(seed(), projectHolder('view')).folders)).toEqual([
      MY_FOLDER_NAME,
      OTHER_FOLDER_NAME,
    ])
  })

  it('gives a task-scoped holder no folder at all, so it cannot render a breadcrumb', () => {
    expect(projectView(seed(), taskHolder('view')).folders).toEqual([])
  })

  it('gives a task-scoped manage holder no folder either, because scope and not role decides', () => {
    expect(projectView(seed(), taskHolder('manage')).folders).toEqual([])
  })

  it('never names the folder holding the task, nor any sibling folder, to a task scope', () => {
    const serialised = JSON.stringify(projectView(seed(), taskHolder('manage')))
    expect(serialised).not.toContain(MY_FOLDER_NAME)
    expect(serialised).not.toContain(OTHER_FOLDER_NAME)
  })
})

describe('projectView and the task entries', () => {
  it('gives an admin every task in the project', () => {
    expect(namesOf(projectView(seed(), admin).tasks)).toEqual([MY_TASK_NAME, SIBLING_TASK_NAME])
  })

  it('gives a project-scoped holder every task in the project', () => {
    expect(namesOf(projectView(seed(), projectHolder('view')).tasks)).toEqual([
      MY_TASK_NAME,
      SIBLING_TASK_NAME,
    ])
  })

  it('gives a task-scoped holder its own task and nothing else', () => {
    const view = projectView(seed(), taskHolder('view'))
    expect(view.tasks.map((each) => each.id)).toEqual([MINE])
  })

  it('never names a sibling task to a task-scoped holder, whatever its role', () => {
    const serialised = JSON.stringify(projectView(seed(), taskHolder('manage')))
    expect(serialised).not.toContain(SIBLING_TASK_NAME)
    expect(serialised).toContain(MY_TASK_NAME)
  })
})

describe('projectView and the share links block', () => {
  it('gives an admin every link the manifest holds', () => {
    expect(tokensOf(projectView(seed(), admin).shareLinks)).toEqual([
      WHOLE_PROJECT,
      READ_ONLY_SEAT,
      OWN_TASK,
      TASK_SEAT,
      SIBLING_TASK,
      OTHER_PROJECT,
    ])
  })

  it('omits the block entirely for a view holder rather than handing it an empty array', () => {
    expect(projectView(seed(), projectHolder('view', READ_ONLY_SEAT)).shareLinks).toBeUndefined()
  })

  it('omits the block for a write holder too, since share:read is a manage grant', () => {
    expect(projectView(seed(), projectHolder('write')).shareLinks).toBeUndefined()
  })

  it('never hands a view holder even its own token, because the block is refused outright', () => {
    const serialised = JSON.stringify(projectView(seed(), projectHolder('view', READ_ONLY_SEAT)))
    expect(serialised).not.toContain(READ_ONLY_SEAT)
  })

  it('gives a project-scoped manage holder the links inside its own project', () => {
    expect(tokensOf(projectView(seed(), projectHolder('manage')).shareLinks)).toEqual([
      WHOLE_PROJECT,
      READ_ONLY_SEAT,
      OWN_TASK,
      TASK_SEAT,
      SIBLING_TASK,
    ])
  })

  it('refuses a manage holder a link scoped into another project, which import can plant', () => {
    const view = projectView(seed(), projectHolder('manage'))
    expect(tokensOf(view.shareLinks)).not.toContain(OTHER_PROJECT)
    expect(JSON.stringify(view)).not.toContain(OTHER_PROJECT)
  })

  it('gives an admin an empty block rather than no block when a project has no links', () => {
    const bare = manifest(PROJECT, { name: PROJECT_NAME })
    expect(projectView(bare, admin).shareLinks).toEqual([])
  })

  it('omits the block for a task-scoped manage holder, whose scope is not the project', () => {
    expect(projectView(seed(), taskHolder('manage')).shareLinks).toBeUndefined()
  })
})

describe('view clearance asks the policy the right question', () => {
  it('puts the share links block to the policy as share:read on a project target', () => {
    expect(clearance({ kind: 'share-links', projectId: PROJECT })).toEqual({
      action: 'share:read',
      target: { kind: 'project', projectId: PROJECT },
    })
  })

  it('puts one link to the policy as share:read on that link own scope', () => {
    const one = link(OWN_TASK, 'manage', taskScope(MINE))
    expect(clearance({ kind: 'share-link', link: one })).toEqual({
      action: 'share:read',
      target: { kind: 'task', projectId: PROJECT, taskId: MINE },
    })
  })

  it('puts a folder to the policy as project:read on a folder target', () => {
    expect(clearance({ kind: 'folder', projectId: PROJECT })).toEqual({
      action: 'project:read',
      target: { kind: 'folder', projectId: PROJECT },
    })
  })

  it('puts a task entry to the policy as task:read on that task', () => {
    expect(clearance({ kind: 'task', projectId: PROJECT, taskId: MINE })).toEqual({
      action: 'task:read',
      target: { kind: 'task', projectId: PROJECT, taskId: MINE },
    })
  })

  it('never asks about a folder as a project, which a task scope would answer yes to', () => {
    const asFolder = clearance({ kind: 'folder', projectId: PROJECT })
    expect(can(taskHolder('manage'), asFolder.action, asFolder.target)).toBe(false)
  })
})

describe('deriving a link target from the link itself, rather than restating scope', () => {
  it('clears a task-scoped manage holder for a link scoped to its own task', () => {
    const own = link(OWN_TASK, 'manage', taskScope(MINE))
    expect(visibleTo(taskHolder('manage'), { kind: 'share-link', link: own })).toBe(true)
  })

  it('refuses the same holder a link scoped to a sibling task, through withinTaskScope', () => {
    const theirs = link(SIBLING_TASK, 'view', taskScope(SIBLING))
    expect(visibleTo(taskHolder('manage'), { kind: 'share-link', link: theirs })).toBe(false)
  })

  it('refuses a task-scoped view holder its own task link, because view carries no share:read', () => {
    const own = link(OWN_TASK, 'manage', taskScope(MINE))
    expect(visibleTo(taskHolder('view'), { kind: 'share-link', link: own })).toBe(false)
  })
})

describe('projectView is a pure function of its inputs', () => {
  it('leaves the manifest it was handed exactly as it found it', () => {
    const original = seed()
    const before = JSON.stringify(original)
    projectView(original, taskHolder('manage'))
    expect(JSON.stringify(original)).toBe(before)
  })

  it('answers the same thing twice, because nothing outside its arguments is consulted', () => {
    const first = projectView(seed(), projectHolder('manage'))
    const second = projectView(seed(), projectHolder('manage'))
    expect(second).toEqual(first)
  })
})
