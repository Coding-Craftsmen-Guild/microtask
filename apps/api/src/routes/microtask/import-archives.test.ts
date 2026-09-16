import { dirname, join } from 'node:path'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { FileSystem } from '@repo/kernel'
import {
  sessionMarkerFile,
  sniffImportFiles,
  stagedFile,
  type ImportFile,
  type SniffedGroup,
} from '@repo/microtask-domain'
import { manifest, shareLink, taskDocument, taskEntry } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import type { ApiEnv } from '../../auth/env.js'
import type { ApiDeps } from '../../deps.js'
import { IMPORT_CHUNK_LIMIT_BYTES } from '../../http/body-limits.js'
import {
  deflated,
  directory,
  stored,
  symlink,
  textFile,
  zipArchive,
  zipOfFiles,
} from '../../testing/archives.js'
import { GUARDED_PREFIX, IDS, admin, body, buildDeps, testConfig } from '../../testing/harness.js'
import { MAX_ARCHIVE_BYTES, MAX_ARCHIVE_RATIO } from './import/archive.js'
import { MAX_SESSION_BYTES } from './import/staging.js'

const ROOT = testConfig.dataDir
const SESSIONS = `${GUARDED_PREFIX}/import/sessions`
const OCTETS = 'application/octet-stream'
const ARCHIVE = 'drop.zip'
const ENCODER = new TextEncoder()
const DECODER = new TextDecoder()

interface Fixture {
  readonly deps: ApiDeps
  readonly app: OpenAPIHono<ApiEnv>
}

const fixture = async (): Promise<Fixture> => {
  const deps = await buildDeps()
  return { deps, app: createApp(deps) }
}

const opened = async (app: OpenAPIHono<ApiEnv>): Promise<string> => {
  const response = await app.request(SESSIONS, { method: 'POST', headers: admin() })
  expect(response.status).toBe(201)
  return String((await body(response))['sessionId'])
}

const upload = async (
  app: OpenAPIHono<ApiEnv>,
  session: string,
  at: string,
  bytes: Uint8Array,
): Promise<void> => {
  for (let from = 0; from < Math.max(bytes.length, 1); from += IMPORT_CHUNK_LIMIT_BYTES) {
    const slice = bytes.subarray(from, from + IMPORT_CHUNK_LIMIT_BYTES)
    const response = await app.request(
      `${SESSIONS}/${session}/files?path=${encodeURIComponent(at)}`,
      {
        method: 'POST',
        headers: { ...admin(), 'content-type': OCTETS, 'content-length': String(slice.length) },
        body: slice,
      },
    )
    expect([at, response.status]).toEqual([at, 200])
  }
}

const expand = async (
  app: OpenAPIHono<ApiEnv>,
  session: string,
  at = ARCHIVE,
): Promise<Response> =>
  app.request(`${SESSIONS}/${session}/archives?path=${encodeURIComponent(at)}`, {
    method: 'POST',
    headers: admin(),
  })

const refusal = async (response: Response): Promise<unknown[]> => {
  const problem = await body(response)
  return [response.status, problem['code'], String(problem['detail'])]
}

const filesRoot = (session: string): string =>
  dirname(stagedFile(ROOT, 'microtask', session, 'anchor'))

const walk = async (
  files: FileSystem,
  dir: string,
  prefix: string,
): Promise<[string, Uint8Array][]> => {
  const found: [string, Uint8Array][] = []
  for (const name of [...(await files.listFiles(dir))].sort()) {
    const bytes = await files.readBytes(join(dir, name))
    if (bytes !== null) found.push([`${prefix}${name}`, bytes])
  }
  for (const name of [...(await files.listDirs(dir))].sort()) {
    found.push(...(await walk(files, join(dir, name), `${prefix}${name}/`)))
  }
  return found
}

const staged = async (fix: Fixture, session: string): Promise<Map<string, Uint8Array>> =>
  new Map((await walk(fix.deps.fileSystem, filesRoot(session), '')).sort())

const sizeOf = (tree: Map<string, Uint8Array>): number =>
  [...tree.values()].reduce((total, bytes) => total + bytes.length, 0)

const asText = (tree: Map<string, Uint8Array>): Record<string, string> =>
  Object.fromEntries([...tree].map(([at, bytes]) => [at, DECODER.decode(bytes)]))

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

const harvested = (tree: Map<string, Uint8Array>): readonly ImportFile[] =>
  [...tree].map(([at, bytes]): ImportFile => ({ path: at, json: parsed(DECODER.decode(bytes)) }))

const preview = (tree: Map<string, Uint8Array>): readonly SniffedGroup[] =>
  sniffImportFiles(harvested(tree))

const marker = async (fix: Fixture, session: string): Promise<Record<string, unknown>> => {
  const raw = await fix.deps.fileSystem.readText(sessionMarkerFile(ROOT, 'microtask', session))
  return parsed(raw ?? 'null') as Record<string, unknown>
}

const project = (id: string): string =>
  JSON.stringify(
    manifest(id, {
      tasks: [taskEntry(IDS.t1, 'Write the spec')],
      shareLinks: [shareLink('shr_a_token_from_a_zip', id)],
    }),
  )

const DROP: Readonly<Record<string, string>> = {
  [`volume/${IDS.p1}/project.json`]: project(IDS.p1),
  [`volume/${IDS.p1}/tasks/${IDS.t1}.json`]: JSON.stringify(taskDocument(IDS.t1, IDS.tab1)),
  [`volume/${IDS.p2}/tasks/${IDS.t2}.json`]: JSON.stringify(taskDocument(IDS.t2, IDS.tab2)),
  'volume/legacy.json': JSON.stringify({ id: 'p', name: 'Legacy', tabs: [], shareLinks: [] }),
  'volume/notes.txt': 'not json at all, and not a project',
}

const DROPPED_BYTES = 1293

const dropped = async (fix: Fixture): Promise<string> => {
  const session = await opened(fix.app)
  for (const [at, text] of Object.entries(DROP)) {
    await upload(fix.app, session, at, ENCODER.encode(text))
  }
  return session
}

const expanded = async (fix: Fixture, archive: Uint8Array): Promise<string> => {
  const session = await opened(fix.app)
  await upload(fix.app, session, ARCHIVE, archive)
  expect((await expand(fix.app, session)).status).toBe(200)
  return session
}

describe('POST /v1/microtask/import/sessions/{sessionId}/archives', () => {
  it('stages every entry at the path it names and answers what it expanded', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const archive = zipOfFiles(DROP)
    await upload(fix.app, session, ARCHIVE, archive)
    const response = await expand(fix.app, session)
    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({
      archive: ARCHIVE,
      files: 5,
      bytes: DROPPED_BYTES,
      sessionBytes: DROPPED_BYTES,
    })
    expect(sizeOf(await staged(fix, session))).toBe(DROPPED_BYTES)
  })

  it('counts the drop own bytes in that literal, so neither number is the other repeated', () => {
    const total = Object.values(DROP).reduce((sum, text) => sum + ENCODER.encode(text).length, 0)
    expect(total).toBe(DROPPED_BYTES)
    expect(Object.keys(DROP).length).toBe(5)
  })

  it('removes the archive it expanded, so nothing is left for a preview to parse as JSON', async () => {
    const fix = await fixture()
    const session = await expanded(fix, zipOfFiles(DROP))
    const tree = await staged(fix, session)
    expect([...tree.keys()]).toEqual(Object.keys(DROP).sort())
    expect(tree.has(ARCHIVE)).toBe(false)
  })

  it('records the expanded paths in the marker and drops the archive from it', async () => {
    const fix = await fixture()
    const session = await expanded(fix, zipOfFiles(DROP))
    const found = await marker(fix, session)
    expect([...(found['paths'] as string[])].sort()).toEqual(Object.keys(DROP).sort())
    expect(found['bytes']).toBe(DROPPED_BYTES)
  })

  it('answers 404 the second time, the archive it expanded no longer being staged', async () => {
    const fix = await fixture()
    const session = await expanded(fix, zipOfFiles(DROP))
    const response = await expand(fix.app, session)
    expect(response.status).toBe(404)
    expect(String((await body(response))['detail'])).toContain(ARCHIVE)
  })

  it('answers 404 for a session that holds nothing at that path, naming the path', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect(await refusal(await expand(fix.app, session, 'never-uploaded.zip'))).toEqual([
      404,
      'not_found',
      expect.stringContaining('never-uploaded.zip'),
    ])
  })

  it('answers 404 for a well-formed session id that names no session', async () => {
    const fix = await fixture()
    expect((await expand(fix.app, IDS.missing)).status).toBe(404)
  })

  it('answers 422 for a session id that is not a ULID, before any path is resolved', async () => {
    const fix = await fixture()
    expect((await expand(fix.app, 'not-a-ulid')).status).toBe(422)
  })

  it('stages entries session-relative, not relative to where the archive itself sat', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await upload(fix.app, session, 'inner/holder.zip', zipOfFiles({ 'a/b.json': '{}' }))
    expect((await expand(fix.app, session, 'inner/holder.zip')).status).toBe(200)
    expect([...(await staged(fix, session)).keys()]).toEqual(['a/b.json'])
  })

  it('takes an archive carrying no entries at all, which stages nothing and removes it', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await upload(fix.app, session, ARCHIVE, zipArchive([directory('empty')]))
    expect(await body(await expand(fix.app, session))).toMatchObject({ files: 0, sessionBytes: 0 })
    expect([...(await staged(fix, session)).keys()]).toEqual([])
  })
})

describe('a zip of a directory and the same directory dropped are one import (ADR 0020)', () => {
  it('stages byte for byte the same tree, whichever way the files arrived', async () => {
    const fix = await fixture()
    const fromDrop = await staged(fix, await dropped(fix))
    const fromZip = await staged(fix, await expanded(fix, zipOfFiles(DROP)))
    expect(asText(fromZip)).toEqual(asText(fromDrop))
    expect(asText(fromDrop)).toEqual({ ...DROP })
  })

  it('produces the identical preview through the identical grouping and sniffing', async () => {
    const fix = await fixture()
    const fromDrop = preview(await staged(fix, await dropped(fix)))
    const fromZip = preview(await staged(fix, await expanded(fix, zipOfFiles(DROP))))
    expect(fromZip).toEqual(fromDrop)
  })

  it('previews four groups of three different shapes, so that equality is not two empty lists', async () => {
    const fix = await fixture()
    const groups = preview(await staged(fix, await expanded(fix, zipOfFiles(DROP))))
    expect(groups.map((group) => group.shape).sort()).toEqual([
      'legacy-project',
      'unrecognised',
      'unrecognised',
      'v2-project-directory',
    ])
    expect(groups.map((group) => group.group.path)).toContain(`volume/${IDS.p1}`)
  })

  it('counts the same session bytes either way, the archive own bytes having left the total', async () => {
    const fix = await fixture()
    const drop = await marker(fix, await dropped(fix))
    const zip = await marker(fix, await expanded(fix, zipOfFiles(DROP)))
    expect(zip['bytes']).toEqual(drop['bytes'])
    expect(zip['bytes']).toBe(DROPPED_BYTES)
  })
})

describe('the hardening ADR 0020 names, through the composed app', () => {
  const refuse = async (fix: Fixture, archive: Uint8Array): Promise<unknown[]> => {
    const session = await opened(fix.app)
    await upload(fix.app, session, ARCHIVE, archive)
    return refusal(await expand(fix.app, session))
  }

  it('refuses a traversal in an entry name with a 422 naming the entry and the rule', async () => {
    const fix = await fixture()
    const [status, code, detail] = await refuse(
      fix,
      zipArchive([textFile('../../etc/passwd', 'root:x')]),
    )
    expect([status, code]).toEqual([422, 'invalid'])
    expect(String(detail)).toContain('cannot step out with ".."')
    expect(String(detail)).toContain('Entry "../../etc/passwd" is refused')
  })

  it('refuses a symbolic link outright rather than following it', async () => {
    const fix = await fixture()
    expect(await refuse(fix, zipArchive([symlink('link', '/etc/passwd')]))).toEqual([
      422,
      'invalid',
      expect.stringContaining('symbolic link'),
    ])
  })

  it('refuses a hostile directory entry rather than expanding the archive without it', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const archive = zipArchive([directory('../../etc'), textFile('ok.json', '{}')])
    await upload(fix.app, session, ARCHIVE, archive)
    const [status, code, detail] = await refusal(await expand(fix.app, session))
    expect([status, code]).toEqual([422, 'invalid'])
    expect(String(detail)).toContain('Entry "../../etc/" is refused')
    expect([...(await staged(fix, session)).keys()]).toEqual([ARCHIVE])
  })

  it('refuses an entry expanding above the ratio cap, naming that cap and the measured ratio', async () => {
    const fix = await fixture()
    const [status, code, detail] = await refuse(
      fix,
      zipArchive([deflated('bomb.bin', new Uint8Array(10_000_000))]),
    )
    expect([status, code]).toEqual([422, 'invalid'])
    expect(String(detail)).toContain(`${String(MAX_ARCHIVE_RATIO)}:1`)
    expect(Number(/expands at at least ([\d.]+):1/.exec(String(detail))?.[1])).toBeGreaterThan(
      MAX_ARCHIVE_RATIO,
    )
  })

  it('leaves the staging directory holding the archive alone, never the bomb full expansion', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const archive = zipArchive([deflated('bomb.bin', new Uint8Array(10_000_000))])
    await upload(fix.app, session, ARCHIVE, archive)
    expect((await expand(fix.app, session)).status).toBe(422)
    const tree = await staged(fix, session)
    expect([...tree.keys()]).toEqual([ARCHIVE])
    expect(sizeOf(tree)).toBe(archive.length)
    expect(archive.length).toBeLessThan(10_000_000 / MAX_ARCHIVE_RATIO)
  })

  it('refuses two entries claiming one path with a 409, rather than appending one to the other', async () => {
    const fix = await fixture()
    const twice = zipArchive([textFile('a.json', '{"first":1}'), textFile('./a.json', '{"second":2}')])
    expect(await refuse(fix, twice)).toEqual([
      409,
      'conflict',
      expect.stringContaining('a.json'),
    ])
  })

  it('refuses an entry naming a path the session already staged, which append would concatenate', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await upload(fix.app, session, 'a.json', ENCODER.encode('{"dropped":1}'))
    await upload(fix.app, session, ARCHIVE, zipOfFiles({ 'a.json': '{"zipped":2}' }))
    expect(await refusal(await expand(fix.app, session))).toEqual([
      409,
      'conflict',
      expect.stringContaining('a.json'),
    ])
    expect(asText(await staged(fix, session))['a.json']).toBe('{"dropped":1}')
  })

  it('refuses an archive holding both a file and a file inside it, naming the pair (422)', async () => {
    const fix = await fixture()
    const pair = zipArchive([textFile('a', '{}'), textFile('a/b', '{}')])
    const [status, code, detail] = await refuse(fix, pair)
    expect([status, code]).toEqual([422, 'invalid'])
    expect(String(detail)).toContain('"a"')
    expect(String(detail)).toContain('"a/b"')
  })

  it('refuses an entry that would sit inside a file the drop beside it already staged', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await upload(fix.app, session, 'volume', ENCODER.encode('a file, not a directory'))
    await upload(fix.app, session, ARCHIVE, zipOfFiles({ 'volume/project.json': '{}' }))
    const [status, , detail] = await refusal(await expand(fix.app, session))
    expect(status).toBe(422)
    expect(String(detail)).toContain('"volume/project.json"')
  })

  it('refuses a file that is not an archive at all with a 422, not a 500', async () => {
    const fix = await fixture()
    expect(await refuse(fix, ENCODER.encode('{"id":"a manifest, uploaded as a zip"}'))).toEqual([
      422,
      'invalid',
      expect.stringContaining('not a zip archive'),
    ])
  })

  it('refuses an expansion that would carry the session past its byte cap, with a 409', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const archive = zipOfFiles({ 'a.json': 'x'.repeat(1000) })
    await upload(fix.app, session, ARCHIVE, archive)
    await fix.deps.fileSystem.writeTextAtomic(
      sessionMarkerFile(ROOT, 'microtask', session),
      JSON.stringify({
        openedAt: '2026-09-10T00:00:00.000Z',
        bytes: MAX_SESSION_BYTES + archive.length - 999,
        paths: [ARCHIVE],
      }),
    )
    const [status, code, detail] = await refusal(await expand(fix.app, session))
    expect([status, code]).toEqual([409, 'conflict'])
    expect(String(detail)).toContain(String(MAX_SESSION_BYTES))
  })

  it('states a size cap that a session can never meet first, so the two caps cannot be confused', () => {
    expect(MAX_ARCHIVE_BYTES).toBeLessThan(MAX_SESSION_BYTES)
    expect(MAX_ARCHIVE_BYTES * 2).toBeLessThan(MAX_SESSION_BYTES)
  })

  it('stages a project directory whose archive carries directory entries, as a zipper writes it', async () => {
    const fix = await fixture()
    const session = await expanded(
      fix,
      zipArchive([
        directory('volume'),
        directory(`volume/${IDS.p1}`),
        textFile(`volume/${IDS.p1}/project.json`, project(IDS.p1)),
      ]),
    )
    expect([...(await staged(fix, session)).keys()]).toEqual([`volume/${IDS.p1}/project.json`])
  })

  it('expands a stored entry as readily as a deflated one, the bytes being what matters', async () => {
    const fix = await fixture()
    const session = await expanded(fix, zipArchive([stored('a.json', ENCODER.encode('{"a":1}'))]))
    expect(asText(await staged(fix, session))).toEqual({ 'a.json': '{"a":1}' })
  })
})

describe('the archive counts as staged until it is gone, which its own late removal requires', () => {
  it('refuses an entry that would be a file inside the archive path, naming the pair', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await upload(fix.app, session, ARCHIVE, zipOfFiles({ [`${ARCHIVE}/a.json`]: '{}' }))
    const [status, , detail] = await refusal(await expand(fix.app, session))
    expect(status).toBe(422)
    expect(String(detail)).toContain(`"${ARCHIVE}"`)
    expect(String(detail)).toContain(`"${ARCHIVE}/a.json"`)
  })

  it('refuses an entry naming the archive itself, which append would fold into it and then delete', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await upload(fix.app, session, ARCHIVE, zipOfFiles({ [ARCHIVE]: '{"inner":true}' }))
    expect(await refusal(await expand(fix.app, session))).toEqual([
      409,
      'conflict',
      expect.stringContaining(ARCHIVE),
    ])
  })

  it('keeps the archive staged when it refuses, so the operator can fix it and expand again', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const archive = zipArchive([textFile('../../etc/passwd', 'root:x')])
    await upload(fix.app, session, ARCHIVE, archive)
    expect((await expand(fix.app, session)).status).toBe(422)
    const tree = await staged(fix, session)
    expect([...tree.keys()]).toEqual([ARCHIVE])
    expect((await marker(fix, session))['paths']).toEqual([ARCHIVE])
  })
})
