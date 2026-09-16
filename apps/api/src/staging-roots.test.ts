import { join, resolve, sep } from 'node:path'
import { MemoryFileSystem } from '@repo/kernel/testing'
import { ulid } from '@repo/kernel'
import {
  FsProjectStore,
  ShareIndex,
  buildDir,
  buildRoot,
  projectsDir,
  stagingDir,
  stagingRoot,
} from '@repo/microtask-domain'
import { manifest, shareLink } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import type { ApiDeps } from './deps.js'
import { warmTokenIndex } from './runtime.js'
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
  const at = `${SESSIONS}/${String(sessionId)}/files?path=drop/${id}/project.json`
  const staged = await app.request(at, {
    method: 'POST',
    headers: { ...admin(), 'content-type': 'application/octet-stream' },
    body: text,
  })
  expect(staged.status).toBe(200)
}

describe('ADR 0045 (a): the positive control, so the absence assertion below can see a failure', () => {
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

describe('ADR 0045 (a): the same bytes staged as an upload reach neither', () => {
  it('leaves the projects list empty, the staging root being no child of it', async () => {
    const { deps } = await onDisk()
    const id = ulid()
    await upload(deps, id, dropped(id))
    expect(await listed(deps)).toEqual([])
  })

  it('warms no token, so an unconfirmed drop’s credentials are not live after a restart', async () => {
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
