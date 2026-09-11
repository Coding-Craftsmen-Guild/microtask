import { describe, expect, it } from 'vitest'
import { NotFound, type Principal, type Role } from '@repo/kernel'
import type { DocumentJson } from '../entities/document.js'
import type { ProjectManifest } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'
import { folder, manifest, taskEntry, STAMP } from '../testing/fixtures.js'
import { taskView } from './task-view.js'

const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const MINE = '01M240ERCRWWCN16Q5AHP1FZAB'
const SIBLING = '01M240ERCRWWCN16Q5AHP1FZAD'
const ABSENT = '01M240ERCRWWCN16Q5AHP1FZAF'
const MY_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAG'
const OTHER_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAH'
const FIRST_TAB = '01M240ERCRWWCN16Q5AHP1FZAM'
const SECOND_TAB = '01M240ERCRWWCN16Q5AHP1FZAN'

const PROJECT_NAME = 'Hollowmere Migration'
const MY_FOLDER_NAME = 'Ashcombe hollowmere holdings'
const OTHER_FOLDER_NAME = 'Draypool hollowmere group'
const MY_TASK_NAME = 'Renew the hollowmere certificate'
const SIBLING_TASK_NAME = 'Audit the hollowmere invoices'
const FIRST_TAB_NAME = 'Hollowmere dossier'
const SECOND_TAB_NAME = 'Hollowmere ledger'

const admin: Principal = { kind: 'admin' }

const projectHolder = (role: Role = 'view'): Principal => ({
  kind: 'link',
  role,
  token: 'shr_ptarmigan_wholeproject',
  scope: { kind: 'project', projectId: PROJECT },
})

const taskHolder = (role: Role = 'view'): Principal => ({
  kind: 'link',
  role,
  token: 'shr_ptarmigan_owntaskonly',
  scope: { kind: 'task', projectId: PROJECT, taskId: MINE },
})

const checklist = (done: number, open: number): DocumentJson => ({
  type: 'doc',
  content: [
    {
      type: 'taskList',
      content: [
        ...Array.from({ length: done }, () => ({ type: 'taskItem', attrs: { checked: true } })),
        ...Array.from({ length: open }, () => ({ type: 'taskItem', attrs: { checked: false } })),
      ],
    },
  ],
})

const taskFile = (): TaskDocument => ({
  id: MINE,
  createdAt: STAMP,
  updatedAt: STAMP,
  tabs: [
    {
      id: FIRST_TAB,
      name: FIRST_TAB_NAME,
      position: 0,
      document: checklist(1, 1),
      createdAt: STAMP,
      updatedAt: STAMP,
    },
    {
      id: SECOND_TAB,
      name: SECOND_TAB_NAME,
      position: 1,
      document: checklist(2, 0),
      createdAt: STAMP,
      updatedAt: STAMP,
    },
  ],
})

const seed = (overrides: Partial<ProjectManifest> = {}): ProjectManifest =>
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
    ...overrides,
  })

describe('taskView carries the task and its tab documents', () => {
  it('names the task from the manifest entry, which is the only home for its name', () => {
    const view = taskView(seed(), taskFile(), admin)
    expect(view.id).toBe(MINE)
    expect(view.name).toBe(MY_TASK_NAME)
    expect(view.projectId).toBe(PROJECT)
    expect(view.position).toBe(0)
  })

  it('carries every tab with its document, which is what a task file is', () => {
    const view = taskView(seed(), taskFile(), admin)
    expect(view.tabs.map((each) => each.name)).toEqual([FIRST_TAB_NAME, SECOND_TAB_NAME])
    expect(view.tabs[0]?.document).toEqual(checklist(1, 1))
  })

  it('throws NotFound when the manifest holds no entry for the document it was handed', () => {
    const orphan = { ...taskFile(), id: ABSENT }
    expect(() => taskView(seed(), orphan, admin)).toThrow(NotFound)
  })
})

describe('taskView derives progress from the documents rather than the manifest cache', () => {
  it('counts every tab, so a task is not the progress of its first tab', () => {
    expect(taskView(seed(), taskFile(), admin).progress).toEqual({ done: 3, total: 4 })
  })

  it('reports what the documents say when the cached count disagrees with them', () => {
    const stale = seed({
      tasks: [taskEntry(MINE, MY_TASK_NAME, { progress: { done: 9, total: 9 } })],
    })
    expect(taskView(stale, taskFile(), admin).progress).toEqual({ done: 3, total: 4 })
  })

  it('reports nothing done out of nothing when the task holds no tabs', () => {
    const empty = { ...taskFile(), tabs: [] }
    expect(taskView(seed(), empty, admin).progress).toEqual({ done: 0, total: 0 })
  })
})

describe('taskView and the folder the task sits in', () => {
  it('tells an admin which folder holds the task', () => {
    expect(taskView(seed(), taskFile(), admin).folder?.name).toBe(MY_FOLDER_NAME)
  })

  it('tells a project-scoped holder too, since project:read reaches a folder target', () => {
    expect(taskView(seed(), taskFile(), projectHolder()).folder?.name).toBe(MY_FOLDER_NAME)
  })

  it('tells a task-scoped holder nothing, so no breadcrumb can name another client', () => {
    expect(taskView(seed(), taskFile(), taskHolder()).folder).toBeNull()
  })

  it('tells a task-scoped manage holder nothing either, because scope and not role decides', () => {
    expect(taskView(seed(), taskFile(), taskHolder('manage')).folder).toBeNull()
  })

  it('never names any folder to a task-scoped holder, in any field of the view', () => {
    const serialised = JSON.stringify(taskView(seed(), taskFile(), taskHolder('manage')))
    expect(serialised).not.toContain(MY_FOLDER_NAME)
    expect(serialised).not.toContain(OTHER_FOLDER_NAME)
    expect(serialised).not.toContain(MY_FOLDER)
  })

  it('reports a task at the project root as being in no folder, for every principal', () => {
    const rooted = seed({ tasks: [taskEntry(MINE, MY_TASK_NAME)] })
    expect(taskView(rooted, taskFile(), admin).folder).toBeNull()
  })
})

describe('taskView leaks nothing about the rest of the project', () => {
  it('never names a sibling task, whoever is asking', () => {
    const serialised = JSON.stringify(taskView(seed(), taskFile(), taskHolder()))
    expect(serialised).not.toContain(SIBLING_TASK_NAME)
    expect(serialised).toContain(MY_TASK_NAME)
  })

  it('carries no share link block at all, because a task is not where sharing is listed', () => {
    expect(JSON.stringify(taskView(seed(), taskFile(), admin))).not.toContain('shr_')
  })
})

describe('taskView is a pure function of its inputs', () => {
  it('leaves the manifest and the document exactly as it found them', () => {
    const original = seed()
    const task = taskFile()
    const before = JSON.stringify([original, task])
    taskView(original, task, taskHolder())
    expect(JSON.stringify([original, task])).toBe(before)
  })
})
