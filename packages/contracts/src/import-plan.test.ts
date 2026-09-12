import { describe, expect, it } from 'vitest'
import {
  ConflictChoice,
  ImportConfirmRequest,
  ImportOutcome,
  ImportPreview,
  ImportPreviewGroup,
  ImportPreviewShareLink,
  ImportShape,
  MAX_PREVIEW_REASONS,
  MAX_PREVIEW_TEXT_LENGTH,
} from './import-plan.js'
import { LIMITS } from './limits.js'

const ulid = (seed: number): string => `01M240ERCRWWCN16Q5AH${String(seed).padStart(6, '0')}`

const PROJECT = ulid(1)
const TASK = ulid(11)
const SESSION = ulid(9)
const TOKEN = 'yjKq3Zc1vHt8Lm0Pw5Rb2Nd7'
const PARENT_TOKEN = 'Gq7Lm2Zx9Vb4Nd8Kt1Ry6Wp3'
const STAMP = '2026-09-10T00:00:00.000Z'

const FIELDS = [
  'path',
  'shape',
  'projectId',
  'name',
  'manifestTaskCount',
  'taskFilesFound',
  'shareLinks',
  'existsInTarget',
  'outcome',
  'reasons',
]

const link = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  index: 0,
  name: 'Acme',
  role: 'manage',
  scope: { kind: 'project', projectId: PROJECT },
  ...over,
})

const group = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  path: 'volume/projects/01M240ERCRWWCN16Q5AH000001',
  shape: 'v2-project-directory',
  projectId: PROJECT,
  name: 'Launch',
  manifestTaskCount: 9,
  taskFilesFound: 9,
  shareLinks: [link()],
  existsInTarget: false,
  outcome: 'importable',
  reasons: [],
  ...over,
})

const preview = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  sessionId: SESSION,
  groups: [group()],
  ...over,
})

describe('the preview names one group per dropped directory (ADR 0018)', () => {
  it('accepts a group as a preview describes it', () => {
    expect(ImportPreviewGroup.safeParse(group()).error?.issues ?? []).toEqual([])
    expect(ImportPreview.safeParse(preview()).error?.issues ?? []).toEqual([])
  })

  it('names exactly what section 7.3 requires of a group and nothing else', () => {
    expect(Object.keys(ImportPreviewGroup.shape).sort()).toEqual([...FIELDS].sort())
  })

  it.each(FIELDS)('requires %s rather than leaving it optional', (field) => {
    const { [field]: dropped, ...without } = group()
    expect(dropped).toBeDefined()
    expect(ImportPreviewGroup.safeParse(without).success).toBe(false)
  })

  it('detects one of the four shapes ADR 0018 lists, or says it recognised none of them', () => {
    expect(ImportShape.options).toEqual([
      'v2-workspace-bundle',
      'v2-single-project',
      'v2-project-directory',
      'legacy-project',
      'unrecognised',
    ])
    expect(ImportPreviewGroup.safeParse(group({ shape: 'v1-project' })).success).toBe(false)
  })

  it('counts the manifest and the files apart, so a cross-check has two numbers to compare', () => {
    const mismatched = group({ manifestTaskCount: 9, taskFilesFound: 8, outcome: 'blocked', reasons: ['one missing'] })
    const parsed = ImportPreviewGroup.parse(mismatched)
    expect([parsed.manifestTaskCount, parsed.taskFilesFound]).toEqual([9, 8])
    expect(ImportPreviewGroup.safeParse(group({ taskFilesFound: -1 })).success).toBe(false)
  })

  it('reports a task count over the product bound rather than refusing to describe it', () => {
    const over = group({
      manifestTaskCount: LIMITS.tasksPerProject + 1,
      taskFilesFound: LIMITS.tasksPerProject + 1,
      outcome: 'blocked',
      reasons: ['too many tasks'],
    })
    expect(ImportPreviewGroup.safeParse(over).error?.issues ?? []).toEqual([])
  })

  it('says there was no manifest at all, which is a different fact from a manifest of none', () => {
    const orphan = group({
      shape: 'unrecognised',
      projectId: null,
      name: '',
      manifestTaskCount: null,
      taskFilesFound: 3,
      shareLinks: [],
      outcome: 'error',
      reasons: ['no project.json beside these task files'],
    })
    expect(ImportPreviewGroup.safeParse(orphan).error?.issues ?? []).toEqual([])
    expect(ImportPreviewGroup.safeParse(group({ manifestTaskCount: 0 })).success).toBe(true)
  })

  it('keeps a project id a real id, so what the preview names can address a project', () => {
    expect(ImportPreviewGroup.safeParse(group({ projectId: '../../etc/passwd' })).success).toBe(false)
  })

  it('carries a name the importer can actually write, cleaned to the bound every name has', () => {
    expect(ImportPreviewGroup.safeParse(group({ name: '' })).success).toBe(true)
    expect(ImportPreviewGroup.safeParse(group({ name: 'x'.repeat(LIMITS.nameLength) })).success).toBe(true)
    expect(ImportPreviewGroup.safeParse(group({ name: 'x'.repeat(LIMITS.nameLength + 1) })).success).toBe(false)
  })

  it('refuses a name of nothing but spaces, which no cleaned name is and no other shape takes', () => {
    expect(ImportPreviewGroup.safeParse(group({ name: '   ' })).success).toBe(false)
    expect(ImportPreviewShareLink.safeParse(link({ name: '   ' })).success).toBe(false)
  })

  it('bounds the path and every reason, both being text the drop itself chose', () => {
    const at = 'v'.repeat(MAX_PREVIEW_TEXT_LENGTH)
    expect(ImportPreviewGroup.safeParse(group({ path: at })).success).toBe(true)
    expect(ImportPreviewGroup.safeParse(group({ path: `${at}v` })).success).toBe(false)
    expect(ImportPreviewGroup.safeParse(group({ outcome: 'blocked', reasons: [at] })).success).toBe(true)
    expect(ImportPreviewGroup.safeParse(group({ outcome: 'blocked', reasons: [`${at}v`] })).success).toBe(false)
  })

  it('bounds how many reasons one row carries, the eliding being the builder’s job', () => {
    const reasons = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => `reason ${String(index)}`)
    const at = group({ outcome: 'blocked', reasons: reasons(MAX_PREVIEW_REASONS) })
    const over = group({ outcome: 'blocked', reasons: reasons(MAX_PREVIEW_REASONS + 1) })
    expect(ImportPreviewGroup.safeParse(at).success).toBe(true)
    expect(ImportPreviewGroup.safeParse(over).success).toBe(false)
  })

  it('flags a project id the target store already holds, which is what a choice is offered for', () => {
    expect(ImportPreviewGroup.parse(group({ existsInTarget: true })).existsInTarget).toBe(true)
    expect(ImportPreviewGroup.safeParse(group({ existsInTarget: 'maybe' })).success).toBe(false)
  })

  it('refuses two groups claiming one project id, which one per-project choice cannot address', () => {
    const twice = preview({ groups: [group(), group({ path: 'volume/inbox/bundle.json' })] })
    expect(ImportPreview.safeParse(twice).success).toBe(false)
  })

  it('takes any number of groups with no id to claim, an unread drop having none to collide', () => {
    const orphan = (path: string): Record<string, unknown> =>
      group({ path, shape: 'unrecognised', projectId: null, outcome: 'error', reasons: ['no manifest'] })
    const dropped = preview({ groups: [group(), orphan('volume/loose'), orphan('volume/other')] })
    expect(ImportPreview.safeParse(dropped).error?.issues ?? []).toEqual([])
  })
})

describe('an outcome is importable, blocked or error, and never a warning', () => {
  it('names the three the plan fixes', () => {
    expect(ImportOutcome.options).toEqual(['importable', 'blocked', 'error'])
    expect(ImportPreviewGroup.safeParse(group({ outcome: 'warning' })).success).toBe(false)
  })

  it('makes a group that cannot be imported say why, rather than rendering an empty row', () => {
    expect(ImportPreviewGroup.safeParse(group({ outcome: 'blocked', reasons: [] })).success).toBe(false)
    expect(ImportPreviewGroup.safeParse(group({ outcome: 'error', reasons: [] })).success).toBe(false)
  })

  it('accepts every reason a group failed for, because the preview describes them at once', () => {
    const many = group({ outcome: 'blocked', reasons: ['tasks in manifest: 9, task files found: 8', 'a bad href'] })
    expect(ImportPreviewGroup.parse(many).reasons).toHaveLength(2)
  })

  it('accepts an importable group with nothing to say', () => {
    expect(ImportPreviewGroup.parse(group()).reasons).toEqual([])
  })
})

describe('the preview carries no share token, its own or any other (ADR 0033)', () => {
  it('has no token field and no createdBy field, so none can travel in a preview', () => {
    const keys = Object.keys(ImportPreviewShareLink.shape)
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('createdBy')
    expect(keys).toEqual(['name', 'role', 'scope', 'index'])
  })

  it('strips a token and a lineage token a caller handed it', () => {
    const parsed = ImportPreviewShareLink.parse(link({ token: TOKEN, createdBy: PARENT_TOKEN, createdAt: STAMP }))
    expect(parsed).not.toHaveProperty('token')
    expect(parsed).not.toHaveProperty('createdBy')
    expect(JSON.stringify(parsed)).not.toContain(TOKEN)
    expect(JSON.stringify(parsed)).not.toContain(PARENT_TOKEN)
  })

  it('strips them through the whole wire shape, which is what reaches an admin page', () => {
    const loaded = preview({
      groups: [group({ shareLinks: [link({ token: TOKEN, createdBy: PARENT_TOKEN })] })],
    })
    expect(JSON.stringify(ImportPreview.parse(loaded))).not.toContain(TOKEN)
    expect(JSON.stringify(ImportPreview.parse(loaded))).not.toContain(PARENT_TOKEN)
  })

  it('shows the role and the scope, which is what makes a chosen manage link visible (ADR 0019)', () => {
    const scope = { kind: 'task', projectId: PROJECT, taskId: TASK }
    const parsed = ImportPreviewShareLink.parse(link({ role: 'manage', scope, token: TOKEN }))
    expect(parsed.role).toBe('manage')
    expect(parsed.scope).toEqual(scope)
    expect(ImportPreviewShareLink.safeParse(link({ role: 'owner' })).success).toBe(false)
  })

  it('accepts a link with no name, which production data already holds', () => {
    expect(ImportPreviewShareLink.parse(link({ name: '' })).name).toBe('')
  })

  it('gives every link an index, which is how a later confirm names one without its token', () => {
    const { index, ...without } = link()
    expect(index).toBe(0)
    expect(ImportPreviewShareLink.safeParse(without).success).toBe(false)
    expect(ImportPreviewShareLink.safeParse(link({ index: -1 })).success).toBe(false)
    expect(ImportPreviewShareLink.parse(link({ index: 3 })).index).toBe(3)
  })
})

describe('a confirm applies one staged session under one choice per project', () => {
  const confirm = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    sessionId: SESSION,
    choices: [{ projectId: PROJECT, choice: 'replace' }],
    ...over,
  })

  it('names the session it applies rather than re-posting the payload (ADR 0015)', () => {
    expect(ImportConfirmRequest.safeParse(confirm()).error?.issues ?? []).toEqual([])
    const { sessionId, ...without } = confirm()
    expect(sessionId).toBe(SESSION)
    expect(ImportConfirmRequest.safeParse(without).success).toBe(false)
    expect(ImportConfirmRequest.safeParse(confirm({ sessionId: 'session-1' })).success).toBe(false)
  })

  it('offers exactly skip, new and replace', () => {
    expect(ConflictChoice.options).toEqual(['skip', 'new', 'replace'])
    const merge = confirm({ choices: [{ projectId: PROJECT, choice: 'merge' }] })
    expect(ImportConfirmRequest.safeParse(merge).success).toBe(false)
  })

  it('refuses two choices for one project, which no route could honour either way', () => {
    const twice = confirm({
      choices: [
        { projectId: PROJECT, choice: 'replace' },
        { projectId: PROJECT, choice: 'skip' },
      ],
    })
    expect(ImportConfirmRequest.safeParse(twice).success).toBe(false)
  })

  it('takes no choices at all, a session whose projects are all new needing none', () => {
    expect(ImportConfirmRequest.parse(confirm({ choices: [] })).choices).toEqual([])
  })

  it('accepts a project id only the session can vouch for, the 422 for one it cannot being the route', () => {
    const stranger = confirm({ choices: [{ projectId: ulid(777), choice: 'new' }] })
    expect(ImportConfirmRequest.safeParse(stranger).error?.issues ?? []).toEqual([])
  })

  it('refuses a project id that is not an id, since a choice names a path segment', () => {
    const hostile = confirm({ choices: [{ projectId: '../../etc', choice: 'skip' }] })
    expect(ImportConfirmRequest.safeParse(hostile).success).toBe(false)
  })
})

describe('the three refined shapes are built on a base rather than derived from (zod 4)', () => {
  it('throws on the omit, pick and partial this package composes with everywhere else', () => {
    expect(() => ImportPreviewGroup.omit({ path: true })).toThrow(/refinements/)
    expect(() => ImportPreview.partial()).toThrow(/refinements/)
    expect(() => ImportConfirmRequest.pick({ sessionId: true })).toThrow(/refinements/)
  })
})
