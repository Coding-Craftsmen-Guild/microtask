import { describe, expect, it } from 'vitest'
import type { Principal, ProjectScope, Role } from '@repo/kernel'
import type { DocumentJson } from '../entities/document.js'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import type { TaskDocument } from '../entities/task.js'
import { folder, manifest, taskEntry, STAMP } from '../testing/fixtures.js'
import { projectListItem, projectView } from './project-view.js'
import { shareView } from './share-view.js'
import { taskView } from './task-view.js'

const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const ELSEWHERE = '01M240ERCRWWCN16Q5AHP1FZAC'
const MINE = '01M240ERCRWWCN16Q5AHP1FZAB'
const SIBLING = '01M240ERCRWWCN16Q5AHP1FZAD'
const MY_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAG'
const OTHER_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAH'
const MY_TAB = '01M240ERCRWWCN16Q5AHP1FZAM'

const PROJECT_NAME = 'Hollowmere Migration'
const MY_FOLDER_NAME = 'Ashcombe hollowmere holdings'
const OTHER_FOLDER_NAME = 'Draypool hollowmere group'
const MY_TASK_NAME = 'Renew the hollowmere certificate'
const SIBLING_TASK_NAME = 'Audit the hollowmere invoices'
const MY_TAB_NAME = 'Hollowmere dossier'

const WHOLE_PROJECT = 'shr_ptarmigan_wholeproject'
const READ_ONLY_SEAT = 'shr_ptarmigan_readonlyseat'
const OWN_TASK = 'shr_ptarmigan_owntaskonly'
const TASK_SEAT = 'shr_ptarmigan_taskviewseat'
const SIBLING_TASK = 'shr_ptarmigan_siblingtask'
const OTHER_PROJECT = 'shr_ptarmigan_otherproject'

const EVERY_TOKEN = [
  WHOLE_PROJECT,
  READ_ONLY_SEAT,
  OWN_TASK,
  TASK_SEAT,
  SIBLING_TASK,
  OTHER_PROJECT,
] as const

const EVERY_NAME = [
  PROJECT_NAME,
  MY_FOLDER_NAME,
  OTHER_FOLDER_NAME,
  MY_TASK_NAME,
  SIBLING_TASK_NAME,
] as const

const INSIDE_A_TASK_SCOPE = [PROJECT_NAME, MY_TASK_NAME] as const

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

const holder = (each: ShareLink): Principal => ({
  kind: 'link',
  role: each.role,
  scope: each.scope,
  token: each.token,
})

const LINKS = {
  wholeProject: link(WHOLE_PROJECT, 'manage', projectScope(PROJECT)),
  readOnlySeat: link(READ_ONLY_SEAT, 'view', projectScope(PROJECT)),
  ownTask: link(OWN_TASK, 'manage', taskScope(MINE)),
  taskSeat: link(TASK_SEAT, 'view', taskScope(MINE)),
  siblingTask: link(SIBLING_TASK, 'view', taskScope(SIBLING)),
  otherProject: link(OTHER_PROJECT, 'manage', projectScope(ELSEWHERE)),
} as const

const checklist = (): DocumentJson => ({
  type: 'doc',
  content: [{ type: 'taskItem', attrs: { checked: true } }],
})

const taskFile = (): TaskDocument => ({
  id: MINE,
  createdAt: STAMP,
  updatedAt: STAMP,
  tabs: [
    {
      id: MY_TAB,
      name: MY_TAB_NAME,
      position: 0,
      document: checklist(),
      createdAt: STAMP,
      updatedAt: STAMP,
    },
  ],
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
    shareLinks: Object.values(LINKS),
  })

interface Caller {
  readonly label: string
  readonly principal: Principal
  readonly tokens: readonly string[]
  readonly names: readonly string[]
}

const CALLERS: readonly Caller[] = [
  {
    label: 'an admin, who owns the workspace',
    principal: { kind: 'admin' },
    tokens: EVERY_TOKEN,
    names: EVERY_NAME,
  },
  {
    label: 'a project-scoped view holder, which holds no share:read',
    principal: holder(LINKS.readOnlySeat),
    tokens: [],
    names: EVERY_NAME,
  },
  {
    label: 'a project-scoped manage holder, whose scope is the whole project',
    principal: holder(LINKS.wholeProject),
    tokens: [WHOLE_PROJECT, READ_ONLY_SEAT, OWN_TASK, TASK_SEAT, SIBLING_TASK],
    names: EVERY_NAME,
  },
  {
    label: 'a task-scoped view holder, which sees one task',
    principal: holder(LINKS.taskSeat),
    tokens: [],
    names: INSIDE_A_TASK_SCOPE,
  },
  {
    label: 'a task-scoped manage holder, whose scope is not the project',
    principal: holder(LINKS.ownTask),
    tokens: [],
    names: INSIDE_A_TASK_SCOPE,
  },
]

const assertTokens = (serialised: string, allowed: readonly string[]): void => {
  for (const token of EVERY_TOKEN) {
    if (allowed.includes(token)) expect(serialised).toContain(token)
    else expect(serialised).not.toContain(token)
  }
}

const assertNames = (serialised: string, allowed: readonly string[]): void => {
  for (const name of EVERY_NAME) {
    if (allowed.includes(name)) expect(serialised).toContain(name)
    else expect(serialised).not.toContain(name)
  }
}

describe('the serialised project view holds exactly what its caller may be told', () => {
  for (const caller of CALLERS) {
    it(`carries only the tokens the policy clears for ${caller.label}`, () => {
      assertTokens(JSON.stringify(projectView(seed(), caller.principal)), caller.tokens)
    })

    it(`carries only the names the policy clears for ${caller.label}`, () => {
      assertNames(JSON.stringify(projectView(seed(), caller.principal)), caller.names)
    })
  }
})

describe('the serialised task view holds no share token, and no name outside the scope', () => {
  for (const caller of CALLERS) {
    it(`carries no share token at all for ${caller.label}`, () => {
      assertTokens(JSON.stringify(taskView(seed(), taskFile(), caller.principal)), [])
    })

    it(`never names a sibling task or a refused folder for ${caller.label}`, () => {
      const serialised = JSON.stringify(taskView(seed(), taskFile(), caller.principal))
      expect(serialised).not.toContain(SIBLING_TASK_NAME)
      expect(serialised).not.toContain(OTHER_FOLDER_NAME)
      expect(serialised).toContain(MY_TASK_NAME)
    })
  }
})

describe('the serialised share view holds no share token, its own included', () => {
  for (const [label, each] of Object.entries(LINKS)) {
    it(`carries no token when the caller is the ${label} link`, () => {
      assertTokens(JSON.stringify(shareView(seed(), each)), [])
    })
  }

  it('names a task-scoped link its own task and nothing else, so it is not simply empty', () => {
    assertNames(JSON.stringify(shareView(seed(), LINKS.ownTask)), INSIDE_A_TASK_SCOPE)
  })

  it('names a project-scoped link every folder and task, which its scope reaches', () => {
    assertNames(JSON.stringify(shareView(seed(), LINKS.readOnlySeat)), EVERY_NAME)
  })
})

describe('the positive control: a token does appear where the policy allows it', () => {
  it('shows an admin every token the manifest holds, so the assertions can fail', () => {
    const serialised = JSON.stringify(projectView(seed(), { kind: 'admin' }))
    for (const token of EVERY_TOKEN) expect(serialised).toContain(token)
  })

  it('shows a project-scoped manage holder its own token, not merely an empty block', () => {
    const serialised = JSON.stringify(projectView(seed(), holder(LINKS.wholeProject)))
    expect(serialised).toContain(WHOLE_PROJECT)
  })
})

describe('the serialised list row holds no share token for anybody at all (ADR 0033)', () => {
  for (const caller of CALLERS) {
    it(`carries not one of the six tokens for ${caller.label}`, () => {
      assertTokens(JSON.stringify(projectListItem(seed(), caller.principal)), [])
    })

    it(`carries only the names the policy clears for ${caller.label}`, () => {
      assertNames(JSON.stringify(projectListItem(seed(), caller.principal)), caller.names)
    })
  }

  it('is not simply empty: a caller cleared for links is told how many there are', () => {
    expect(projectListItem(seed(), { kind: 'admin' }).shareLinkCount).toBe(6)
    expect(projectListItem(seed(), holder(LINKS.wholeProject)).shareLinkCount).toBe(5)
  })

  it('tells a caller refused the block nothing, not even a zero', () => {
    expect(projectListItem(seed(), holder(LINKS.readOnlySeat)).shareLinkCount).toBeUndefined()
    expect(projectListItem(seed(), holder(LINKS.ownTask)).shareLinkCount).toBeUndefined()
  })
})
