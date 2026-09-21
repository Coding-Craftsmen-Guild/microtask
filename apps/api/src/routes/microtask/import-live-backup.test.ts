import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_LISTED_TAB_NAMES } from '@repo/contracts'
import {
  FsProjectStore,
  ShareIndex,
  projectsDir,
  type ProjectStore,
} from '@repo/microtask-domain'
import { MemoryFileSystem } from '@repo/kernel/testing'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { warmTokenIndex } from '../../runtime.js'
import type { ApiEnv } from '../../auth/env.js'
import type { ApiDeps } from '../../deps.js'
import { GUARDED_PREFIX, admin, adminJson, asLink, body, buildDeps, testConfig } from '../../testing/harness.js'

const BACKUP = join(import.meta.dirname, '../../../../../data/projects')

const SESSIONS = `${GUARDED_PREFIX}/import/sessions`

const OCTETS = 'application/octet-stream'

const ROOT = testConfig.dataDir

interface LegacyTab {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly document: unknown
}

interface LegacyLink {
  readonly token: string
  readonly name: string
  readonly permission: string
}

interface LegacyProject {
  readonly id: string
  readonly name: string
  readonly tabs: readonly LegacyTab[]
  readonly shareLinks: readonly LegacyLink[]
}

const files = (): readonly string[] =>
  existsSync(BACKUP) ? readdirSync(BACKUP).filter((one) => one.endsWith('.json')).sort() : []

const hasBackup = files().length > 0

const backup = (): readonly LegacyProject[] =>
  files().map((one) => JSON.parse(readFileSync(join(BACKUP, one), 'utf8')) as LegacyProject)

const hrefsIn = (node: unknown, found: string[] = []): readonly string[] => {
  if (Array.isArray(node)) {
    for (const child of node) hrefsIn(child, found)
    return found
  }
  if (node === null || typeof node !== 'object') return found
  const record = node as Record<string, unknown>
  const attrs = record['attrs']
  if (attrs !== null && typeof attrs === 'object') {
    const href = (attrs as Record<string, unknown>)['href']
    if (typeof href === 'string') found.push(href)
  }
  for (const value of Object.values(record)) hrefsIn(value, found)
  return found
}

const emptyVolume = async (): Promise<{ app: OpenAPIHono<ApiEnv>; deps: ApiDeps }> => {
  const base = await buildDeps()
  const fileSystem = new MemoryFileSystem()
  const store: ProjectStore = new FsProjectStore({ files: fileSystem, root: () => ROOT })
  const deps: ApiDeps = { ...base, fileSystem, store, tokens: new ShareIndex() }
  return { app: createApp(deps), deps }
}

const dropped = async (): Promise<{ app: OpenAPIHono<ApiEnv>; deps: ApiDeps; session: string }> => {
  const { app, deps } = await emptyVolume()
  const opening = await app.request(SESSIONS, { method: 'POST', headers: admin() })
  expect(opening.status).toBe(201)
  const session = String((await body(opening))['sessionId'])
  for (const one of files()) {
    const at = `${session}/files?path=${encodeURIComponent(`backup/${one}`)}&offset=0`
    const staged = await app.request(`${SESSIONS}/${at}`, {
      method: 'POST',
      headers: { ...admin(), 'content-type': OCTETS },
      body: readFileSync(join(BACKUP, one), 'utf8'),
    })
    expect(staged.status).toBe(200)
  }
  return { app, deps, session }
}

const previewRows = async (
  app: OpenAPIHono<ApiEnv>,
  session: string,
): Promise<readonly Record<string, unknown>[]> => {
  const response = await app.request(`${SESSIONS}/${session}/preview`, {
    method: 'GET',
    headers: admin(),
  })
  expect(response.status).toBe(200)
  return (await body(response))['groups'] as readonly Record<string, unknown>[]
}

const confirm = async (
  app: OpenAPIHono<ApiEnv>,
  session: string,
): Promise<readonly Record<string, unknown>[]> => {
  const response = await app.request(`${SESSIONS}/${session}/confirm`, {
    method: 'POST',
    headers: adminJson(),
    body: JSON.stringify({ sessionId: session, choices: [] }),
  })
  expect(response.status).toBe(200)
  return (await body(response))['projects'] as readonly Record<string, unknown>[]
}

describe.skipIf(!hasBackup)('the live backup under data/projects imports as it stands', () => {
  it('is the legacy shape this importer was written for, so the drop needs no conversion first', () => {
    for (const project of backup()) {
      expect(Object.hasOwn(project, 'format')).toBe(false)
      expect(typeof project.id).toBe('string')
      expect(Array.isArray(project.tabs)).toBe(true)
      expect(Array.isArray(project.shareLinks)).toBe(true)
    }
  })

  it('previews every file as an importable legacy project, none unrecognised', async () => {
    const { app, session } = await dropped()
    const rows = await previewRows(app, session)
    expect(rows.length).toBe(files().length)
    expect(rows.map((one) => one['shape'])).toEqual(files().map(() => 'legacy-project'))
    expect(rows.map((one) => one['outcome'])).toEqual(files().map(() => 'importable'))
    expect(rows.every((one) => (one['reasons'] as readonly string[]).length === 0)).toBe(true)
  })

  it('counts each file as exactly one task however many tabs it holds, the cross-check agreeing', async () => {
    const { app, session } = await dropped()
    const rows = await previewRows(app, session)
    const byId = new Map(rows.map((one) => [String(one['projectId']), one]))
    const many = backup().filter((project) => project.tabs.length > 1)
    expect(many.length).toBeGreaterThan(0)
    for (const project of backup()) {
      const row = byId.get(project.id)
      expect([project.id, row?.['manifestTaskCount']]).toEqual([project.id, 1])
      expect([project.id, row?.['taskFilesFound']]).toEqual([project.id, 1])
    }
  })

  it('names every share link the backup holds, with its role and scope and no token', async () => {
    const { app, session } = await dropped()
    const rows = await previewRows(app, session)
    const shown = rows.flatMap((one) => one['shareLinks'] as readonly Record<string, unknown>[])
    const held = backup().flatMap((project) => project.shareLinks)
    expect(shown.length).toBe(held.length)
    expect(shown.every((one) => one['role'] === 'write')).toBe(true)
    expect(shown.every((one) => (one['scope'] as { kind: string }).kind === 'project')).toBe(true)
    const serialised = JSON.stringify(shown)
    for (const link of held) expect(serialised).not.toContain(link.token)
  })

  it('reports no project as already present, this being the empty volume a cutover imports into', async () => {
    const { app, session } = await dropped()
    expect((await previewRows(app, session)).every((one) => one['existsInTarget'] === false)).toBe(
      true,
    )
  })

  it('creates every project under the id the backup gave it, §7.6 being what the redirect rests on', async () => {
    const { app, session } = await dropped()
    const outcomes = await confirm(app, session)
    expect(outcomes.map((one) => one['outcome'])).toEqual(files().map(() => 'created'))
    expect(new Set(outcomes.map((one) => String(one['writtenProjectId'])))).toEqual(
      new Set(backup().map((project) => project.id)),
    )
  })

  it('lands one task under the project’s own id, which is what a legacy address maps onto', async () => {
    const { app, deps, session } = await dropped()
    await confirm(app, session)
    for (const project of backup()) {
      const manifest = (await deps.store.listManifests('microtask')).find(
        (one) => one.id === project.id,
      )
      expect([project.id, manifest?.tasks.map((task) => task.id)]).toEqual([
        project.id,
        [project.id],
      ])
      expect([project.id, manifest?.tasks[0]?.name]).toEqual([project.id, project.name])
    }
  })

  it('gives that task the tab strip the file had, every tab keeping its id, name and position', async () => {
    const { app, deps, session } = await dropped()
    await confirm(app, session)
    for (const project of backup()) {
      const task = await deps.store.readTask('microtask', project.id, project.id)
      expect([project.id, task?.tabs.map((tab) => [tab.id, tab.name, tab.position])]).toEqual([
        project.id,
        project.tabs.map((tab, at) => [tab.id, tab.name, at]),
      ])
    }
  })

  it('files no task under a legacy tab id, the flattening §7.6 used to do being gone', async () => {
    const { app, deps, session } = await dropped()
    await confirm(app, session)
    for (const project of backup()) {
      for (const tab of project.tabs.filter((one) => one.id !== project.id)) {
        expect([tab.id, await deps.store.readTask('microtask', project.id, tab.id)]).toEqual([
          tab.id,
          null,
        ])
      }
    }
  })

  it('preserves every tab the backup held, none dropped into a task nobody opens', async () => {
    const { app, deps, session } = await dropped()
    await confirm(app, session)
    const held = backup().reduce((total, project) => total + project.tabs.length, 0)
    let landed = 0
    for (const project of backup()) {
      landed += (await deps.store.readTask('microtask', project.id, project.id))?.tabs.length ?? 0
    }
    expect(held).toBeGreaterThan(backup().length)
    expect(landed).toBe(held)
  })

  it('caches the whole strip on the manifest entry, up to the eight names a list row draws', async () => {
    const { app, deps, session } = await dropped()
    await confirm(app, session)
    for (const project of backup()) {
      const manifest = await deps.store.readManifest('microtask', project.id)
      expect([project.id, manifest?.tasks[0]?.tabCount]).toEqual([project.id, project.tabs.length])
      expect([project.id, manifest?.tasks[0]?.tabNames]).toEqual([
        project.id,
        project.tabs.slice(0, MAX_LISTED_TAB_NAMES).map((tab) => tab.name),
      ])
    }
  })

  it('keeps every tab document byte-identical to the tab it came from', async () => {
    const { app, deps, session } = await dropped()
    await confirm(app, session)
    for (const project of backup()) {
      const task = await deps.store.readTask('microtask', project.id, project.id)
      for (const [at, tab] of project.tabs.entries()) {
        expect([tab.id, JSON.stringify(task?.tabs[at]?.document)]).toEqual([
          tab.id,
          JSON.stringify(tab.document),
        ])
      }
    }
  })

  it('carries every href the live documents hold through unchanged, schemes and all', async () => {
    const { app, deps, session } = await dropped()
    await confirm(app, session)
    const before = hrefsIn(backup().map((project) => project.tabs.map((tab) => tab.document)))
    const after: string[] = []
    for (const project of backup()) {
      after.push(...hrefsIn(await deps.store.readTask('microtask', project.id, project.id)))
    }
    expect(before.length).toBeGreaterThan(0)
    expect([...after].sort()).toEqual([...before].sort())
  })

  it('opens every share URL the backup had in circulation, at the permission it carried', async () => {
    const { app, session } = await dropped()
    await confirm(app, session)
    for (const project of backup()) {
      for (const link of project.shareLinks) {
        const response = await app.request(`${GUARDED_PREFIX}/shares/current`, {
          method: 'GET',
          headers: asLink(link.token),
        })
        expect([link.name, response.status]).toEqual([link.name, 200])
        const view = await body(response)
        expect([link.name, (view['project'] as { id: string }).id]).toEqual([link.name, project.id])
        expect([link.name, view['role']]).toEqual([link.name, 'write'])
      }
    }
  })

  it('resolves every one of those tokens again from a cold index, as a restart would', async () => {
    const { app, deps, session } = await dropped()
    await confirm(app, session)
    const rebuilt: ApiDeps = { ...deps, tokens: new ShareIndex() }
    expect(await warmTokenIndex(rebuilt)).toBe(
      backup().reduce((total, project) => total + project.shareLinks.length, 0),
    )
    for (const project of backup()) {
      for (const link of project.shareLinks) {
        expect([link.name, rebuilt.tokens.find(link.token)?.projectId]).toEqual([
          link.name,
          project.id,
        ])
      }
    }
  })

  it('writes nothing outside the projects root, the staging and build roots being swept', async () => {
    const { app, deps, session } = await dropped()
    await confirm(app, session)
    const root = projectsDir(ROOT, 'microtask')
    const stored = await deps.fileSystem.listDirs(root)
    expect([...stored].sort()).toEqual(backup().map((project) => project.id).sort())
  })
})
