import { join, resolve, sep } from 'node:path'
import { MemoryFileSystem } from '@repo/kernel/testing'
import { ulid } from '@repo/kernel'
import {
  FsProjectStore,
  ShareIndex,
  buildDir,
  buildRoot,
  projectsDir,
  stagedFile,
  stagingDir,
  stagingRoot,
} from '@repo/microtask-domain'
import { manifest, shareLink } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import type { ApiDeps } from './deps.js'
import { warmTokenIndex } from './runtime.js'
import { zipOfFiles } from './testing/archives.js'
import { GUARDED_PREFIX, admin, body, buildDeps, testConfig } from './testing/harness.js'

const ROOT = testConfig.dataDir
const TOKEN = 'shr_an_unconfirmed_drop'
const SESSIONS = `${GUARDED_PREFIX}/import/sessions`

interface Fixture {
  readonly deps: ApiDeps
  readonly files: MemoryFileSystem
}

const onDisk = async (): Promise<Fixture> => {
  const files = new MemoryFileSystem()
  const base = await buildDeps()
  const store = new FsProjectStore({ files, root: () => ROOT })
  return { deps: { ...base, fileSystem: files, store, tokens: new ShareIndex() }, files }
}

const dropped = (id: string): string =>
  JSON.stringify(manifest(id, { shareLinks: [shareLink(TOKEN, id)] }))

const listed = async (deps: ApiDeps): Promise<readonly string[]> =>
  (await deps.store.listManifests('microtask')).map((found) => found.id)

const upload = async (deps: ApiDeps, id: string, text: string): Promise<void> => {
  const app = createApp(deps)
  const opened = await app.request(SESSIONS, { method: 'POST', headers: admin() })
  expect(opened.status).toBe(201)
  const sessionId = (await body(opened))['sessionId']
  const at = `${SESSIONS}/${String(sessionId)}/files?path=drop/${id}/project.json&offset=0`
  const staged = await app.request(at, {
    method: 'POST',
    headers: { ...admin(), 'content-type': 'application/octet-stream' },
    body: text,
  })
  expect(staged.status).toBe(200)
}

describe('ADR 0045 (a): the positive control, proving both read paths do pick such a directory up', () => {
  it('lists a ULID-named directory written straight under projectsDir as a live project', async () => {
    const { deps, files } = await onDisk()
    const id = ulid()
    await files.writeTextAtomic(join(projectsDir(ROOT, 'microtask'), id, 'project.json'), dropped(id))
    expect(await listed(deps)).toEqual([id])
  })

  it('warms that directory’s share token into the index as a live credential', async () => {
    const { deps, files } = await onDisk()
    const id = ulid()
    await files.writeTextAtomic(join(projectsDir(ROOT, 'microtask'), id, 'project.json'), dropped(id))
    expect(await warmTokenIndex(deps)).toBe(1)
    expect(deps.tokens.find(TOKEN)).toMatchObject({ projectId: id })
  })
})

describe('the same bytes staged as an upload reach neither read path, for a weaker reason', () => {
  it('stages through the FileSystem port and not through the project store, so no project is listed', async () => {
    const { deps } = await onDisk()
    const id = ulid()
    await upload(deps, id, dropped(id))
    expect(await listed(deps)).toEqual([])
  })

  it('warms no token, though so would a wrong layout: uploads keep the drop’s path under files/', async () => {
    const { deps } = await onDisk()
    const id = ulid()
    await upload(deps, id, dropped(id))
    expect(await warmTokenIndex(deps)).toBe(0)
    expect(deps.tokens.find(TOKEN)).toBeNull()
  })
})

describe('ADR 0045 (b): the structural assertion, which holds however the roots are relocated', () => {
  const projects = projectsDir(ROOT, 'microtask')
  const id = ulid()

  it.each([
    ['the staging root', stagingRoot(ROOT, 'microtask')],
    ['one staging session', stagingDir(ROOT, 'microtask', id)],
    ['the build root', buildRoot(ROOT, 'microtask')],
    ['one build directory', buildDir(ROOT, 'microtask', id)],
  ])('puts %s neither at projectsDir nor under it', (_what, resolved) => {
    expect(resolved).not.toBe(projects)
    expect(resolved.startsWith(projects + sep)).toBe(false)
  })

  it('compares against a projects root that is itself under the data root, so this is not vacuous', () => {
    expect(projects.startsWith(resolve(ROOT) + sep)).toBe(true)
    for (const resolved of [stagingRoot(ROOT, 'microtask'), buildRoot(ROOT, 'microtask')]) {
      expect(resolved.startsWith(resolve(ROOT) + sep)).toBe(true)
    }
  })
})

describe('ADR 0045 (b) against an expansion, the layout where the absence assertion has teeth', () => {
  const inZip = async (fix: Fixture, entries: Readonly<Record<string, string>>): Promise<string> => {
    const app = createApp(fix.deps)
    const opened = await app.request(SESSIONS, { method: 'POST', headers: admin() })
    expect(opened.status).toBe(201)
    const session = String((await body(opened))['sessionId'])
    const archive = zipOfFiles(entries)
    const staging = await app.request(`${SESSIONS}/${session}/files?path=drop.zip&offset=0`, {
      method: 'POST',
      headers: { ...admin(), 'content-type': 'application/octet-stream' },
      body: archive,
    })
    expect(staging.status).toBe(200)
    const expanded = await app.request(`${SESSIONS}/${session}/archives?path=drop.zip`, {
      method: 'POST',
      headers: admin(),
    })
    expect([await body(expanded), expanded.status]).toEqual([expect.anything(), 200])
    return session
  }

  it('writes a ULID-named directory holding a project.json — the shape (a) proves is dangerous', async () => {
    const fix = await onDisk()
    const id = ulid()
    const session = await inZip(fix, { [`${id}/project.json`]: dropped(id) })
    const at = stagedFile(ROOT, 'microtask', session, `${id}/project.json`)
    expect(await fix.files.readText(at)).toBe(dropped(id))
  })

  it('lists no project from it, the expansion target being no ancestor of the projects root', async () => {
    const fix = await onDisk()
    const id = ulid()
    await inZip(fix, { [`${id}/project.json`]: dropped(id) })
    expect(await listed(fix.deps)).toEqual([])
  })

  it('warms none of its share tokens, so an unconfirmed drop is no credential', async () => {
    const fix = await onDisk()
    const id = ulid()
    await inZip(fix, { [`${id}/project.json`]: dropped(id) })
    expect(await warmTokenIndex(fix.deps)).toBe(0)
    expect(fix.deps.tokens.find(TOKEN)).toBeNull()
  })

  it('resolves that entry under the staging root and nowhere near projectsDir', async () => {
    const fix = await onDisk()
    const id = ulid()
    const session = await inZip(fix, { [`${id}/project.json`]: dropped(id) })
    const at = stagedFile(ROOT, 'microtask', session, `${id}/project.json`)
    const projects = projectsDir(ROOT, 'microtask')
    expect(at).not.toBe(join(projects, id, 'project.json'))
    expect(at.startsWith(projects + sep)).toBe(false)
    expect(at.startsWith(stagingDir(ROOT, 'microtask', session) + sep)).toBe(true)
  })

  it('reaches neither read path even when the archive names the projects root itself, refusing it', async () => {
    const fix = await onDisk()
    const id = ulid()
    const app = createApp(fix.deps)
    const opened = await app.request(SESSIONS, { method: 'POST', headers: admin() })
    const session = String((await body(opened))['sessionId'])
    const archive = zipOfFiles({ [`../../projects/${id}/project.json`]: dropped(id) })
    await app.request(`${SESSIONS}/${session}/files?path=escape.zip&offset=0`, {
      method: 'POST',
      headers: { ...admin(), 'content-type': 'application/octet-stream' },
      body: archive,
    })
    const expanded = await app.request(`${SESSIONS}/${session}/archives?path=escape.zip`, {
      method: 'POST',
      headers: admin(),
    })
    expect(expanded.status).toBe(422)
    expect(await listed(fix.deps)).toEqual([])
    expect(await warmTokenIndex(fix.deps)).toBe(0)
  })
})
