import type { Clock } from '@repo/kernel'
import { isUlid } from '@repo/kernel'
import { sessionMarkerFile, stagedFile, stagingDir, stagingRoot } from '@repo/microtask-domain'
import { STAMP } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { createApp } from '../../app.js'
import type { ApiEnv } from '../../auth/env.js'
import { AdminVerifier } from '../../auth/admin-verifier.js'
import type { ApiDeps } from '../../deps.js'
import { GLOBAL_BODY_LIMIT_BYTES, IMPORT_CHUNK_LIMIT_BYTES } from '../../http/body-limits.js'
import { docConfig } from '../../http/docs.js'
import {
  GUARDED_PREFIX,
  IDS,
  SERVICE_KEY,
  TOKENS,
  admin,
  asLink,
  body,
  buildApp,
  buildDeps,
  testConfig,
} from '../../testing/harness.js'
import { zipOfFiles } from '../../testing/archives.js'
import { MAX_SESSION_BYTES, SESSION_TTL_MS } from './import/staging.js'

const ROOT = testConfig.dataDir
const SESSIONS = `${GUARDED_PREFIX}/import/sessions`
const OCTETS = 'application/octet-stream'
const HARVESTED = 'drop/project.json'

interface Fixture {
  readonly deps: ApiDeps
  readonly app: OpenAPIHono<ApiEnv>
}

const fixture = async (at?: Clock): Promise<Fixture> => {
  const deps = await buildDeps(at)
  return { deps, app: createApp(deps) }
}

const opened = async (app: OpenAPIHono<ApiEnv>, headers = admin()): Promise<string> => {
  const response = await app.request(SESSIONS, { method: 'POST', headers })
  expect(response.status).toBe(201)
  return String((await body(response))['sessionId'])
}

const sizeOf = (payload: string | Uint8Array): number =>
  typeof payload === 'string' ? new TextEncoder().encode(payload).length : payload.length

interface Upload {
  readonly at: string
  readonly offset: number
}

const resolved = (upload: string | Upload): Upload =>
  typeof upload === 'string' ? { at: upload, offset: 0 } : upload

const chunk = async (
  app: OpenAPIHono<ApiEnv>,
  session: string,
  upload: string | Upload,
  payload: string | Uint8Array,
): Promise<Response> => {
  const { at, offset } = resolved(upload)
  return app.request(
    `${SESSIONS}/${session}/files?path=${encodeURIComponent(at)}&offset=${String(offset)}`,
    {
      method: 'POST',
      headers: {
        ...admin(),
        'content-type': OCTETS,
        'content-length': String(sizeOf(payload)),
      },
      body: payload,
    },
  )
}

const refusal = async (response: Response): Promise<unknown[]> => [
  response.status,
  (await body(response))['code'],
]

const staged = async (fix: Fixture, session: string, at: string): Promise<Uint8Array | null> =>
  fix.deps.fileSystem.readBytes(stagedFile(ROOT, 'microtask', session, at))

const sessionIds = async (fix: Fixture): Promise<readonly string[]> =>
  fix.deps.fileSystem.listDirs(stagingRoot(ROOT, 'microtask'))

const pattern = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length)
  for (let at = 0; at < length; at += 1) bytes[at] = (at * 31 + 7) % 256
  return bytes
}

const firstDifference = (left: Uint8Array, right: Uint8Array): number => {
  for (let at = 0; at < Math.min(left.length, right.length); at += 1) {
    if (left[at] !== right[at]) return at
  }
  return left.length === right.length ? -1 : Math.min(left.length, right.length)
}

const slices = (bytes: Uint8Array, size: number): readonly Uint8Array[] => {
  const out: Uint8Array[] = []
  for (let at = 0; at < bytes.length; at += size) out.push(bytes.subarray(at, at + size))
  return out
}

const ARCHIVE = 'drop.zip'

const named = (at: string): string => {
  if (at.endsWith('/files')) return `?path=${HARVESTED}&offset=0`
  return at.endsWith('/archives') ? `?path=${ARCHIVE}` : ''
}

const confirmBody = (at: string): string => {
  const session = at.split('/sessions/')[1]?.split('/')[0] ?? IDS.missing
  return JSON.stringify({ sessionId: session, choices: [] })
}

const sent = async (
  app: OpenAPIHono<ApiEnv>,
  call: { method: string; path: string },
  credentials: Record<string, string>,
): Promise<Response> => {
  const { method, path } = call
  if (method === 'GET') return app.request(path, { method, headers: credentials })
  if (path.endsWith('/confirm')) {
    const headers = { ...credentials, 'content-type': 'application/json' }
    return app.request(path, { method, headers, body: confirmBody(path) })
  }
  const headers = { ...credentials, 'content-type': OCTETS }
  return app.request(path, { method, headers, body: 'a chunk' })
}

const subtree = async (): Promise<readonly { method: string; path: string }[]> => {
  const paths = (await buildApp()).getOpenAPI31Document(docConfig).paths ?? {}
  return Object.entries(paths)
    .filter(([at]) => at.startsWith(`${GUARDED_PREFIX}/import`))
    .flatMap(([at, item]) =>
      Object.keys(item as Record<string, unknown>).map((method) => ({
        method: method.toUpperCase(),
        path: at.replace('{sessionId}', IDS.missing).concat(named(at)),
      })),
    )
}

describe('POST /v1/microtask/import/sessions', () => {
  it('answers the admin a session id that is a ULID, so it can be a path segment', async () => {
    const { app } = await fixture()
    const session = await opened(app)
    expect(isUlid(session)).toBe(true)
  })

  it('answers the two caps a client has to slice within, rather than leaving it to guess', async () => {
    const { app } = await fixture()
    const response = await app.request(SESSIONS, { method: 'POST', headers: admin() })
    expect(await body(response)).toEqual({
      sessionId: expect.any(String),
      openedAt: STAMP,
      maxChunkBytes: IMPORT_CHUNK_LIMIT_BYTES,
      maxSessionBytes: MAX_SESSION_BYTES,
    })
  })

  it('records openedAt in a marker file, which is what the sweep measures rather than an mtime', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const at = sessionMarkerFile(ROOT, 'microtask', session)
    expect(JSON.parse((await fix.deps.fileSystem.readText(at)) ?? 'null')).toEqual({
      openedAt: STAMP,
      bytes: 0,
      paths: [],
    })
  })
})

describe('every route in the import subtree is admin authority, import being what creates projects', () => {
  it('finds all five addresses in the document, so the refusals below are not one route', async () => {
    expect((await subtree()).length).toBe(5)
  })

  it.each([
    ['a project-scoped manage seat', TOKENS.p1Manage],
    ['the other project’s manage seat', TOKENS.p2Manage],
    ['a task-scoped manage seat', TOKENS.t1Manage],
    ['a write seat', TOKENS.p1Write],
    ['a view seat', TOKENS.p1View],
  ])('refuses %s on every route in the subtree', async (_who, token) => {
    const { app } = await fixture()
    for (const call of await subtree()) {
      const response = await sent(app, call, asLink(token))
      expect([call.path, ...(await refusal(response))]).toEqual([call.path, 403, 'forbidden'])
    }
  })

  it('answers the admin on every route in the subtree, so those refusals are the principal', async () => {
    const { app } = await fixture()
    for (const call of await subtree()) {
      const session = await opened(app)
      const at = call.path.replaceAll(IDS.missing, session)
      expect((await chunk(app, session, ARCHIVE, zipOfFiles({ 'a.json': '{}' }))).status).toBe(200)
      const response = await sent(app, { ...call, path: at }, admin())
      expect([call.path, response.status, response.status < 300]).toEqual([
        call.path,
        response.status,
        true,
      ])
    }
  })
})

describe('the session id in the path (ADR 0045)', () => {
  it('refuses one that is not a ULID with a 422 naming the parameter, not the body', async () => {
    const { app } = await fixture()
    const response = await chunk(app, 'not-a-ulid', HARVESTED, 'a chunk')
    expect(response.status).toBe(422)
    const problem = await body(response)
    expect(problem).toMatchObject({ code: 'invalid', in: 'param' })
    expect(problem['errors']).toMatchObject([{ path: 'sessionId' }])
  })

  it('resolves no path at all for it, leaving the staging root as empty as it found it', async () => {
    const fix = await fixture()
    expect(await sessionIds(fix)).toEqual([])
    expect((await chunk(fix.app, 'not-a-ulid', HARVESTED, 'a chunk')).status).toBe(422)
    expect(await sessionIds(fix)).toEqual([])
  })

  it('answers a well-formed id that names no session with a 404, which is a different fix', async () => {
    const { app } = await fixture()
    expect(await refusal(await chunk(app, IDS.missing, HARVESTED, 'a chunk'))).toEqual([
      404,
      'not_found',
    ])
  })
})

describe('the path a chunk names is re-normalised and re-checked server-side', () => {
  it('stages a file at the path the server normalised, and says which that was', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const response = await chunk(fix.app, session, 'drop//./a/project.json', 'the bytes')
    expect(await body(response)).toEqual({
      path: 'drop/a/project.json',
      chunkBytes: 9,
      sessionBytes: 9,
    })
    expect(await staged(fix, session, 'drop/a/project.json')).toEqual(
      new TextEncoder().encode('the bytes'),
    )
  })

  it.each([
    ['a traversal', '../../etc/passwd'],
    ['a deeper traversal', 'drop/../../../etc/passwd'],
    ['an absolute path', '/etc/passwd'],
    ['a drive letter', 'C:/Windows/system32/config'],
    ['a backslash path', 'drop\\..\\..\\passwd'],
    ['a NUL byte', 'drop/\u0000/project.json'],
  ])('refuses %s with a 422 rather than a 500 from the filesystem', async (_what, hostile) => {
    const { app } = await fixture()
    const session = await opened(app)
    expect(await refusal(await chunk(app, session, hostile, 'a chunk'))).toEqual([422, 'invalid'])
  })

  it('rejects the file and not the session: what was staged stays, and the next file is taken', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, HARVESTED, 'first')).status).toBe(200)
    expect((await chunk(fix.app, session, '../../etc/passwd', 'hostile')).status).toBe(422)
    const after = await chunk(fix.app, session, 'drop/tasks/one.json', 'second')
    expect(await body(after)).toMatchObject({ path: 'drop/tasks/one.json', sessionBytes: 11 })
    expect(await staged(fix, session, HARVESTED)).toEqual(new TextEncoder().encode('first'))
    expect(await sessionIds(fix)).toEqual([session])
  })

  it('refuses a file inside a file already staged with a 422 naming the pair, not a 500', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, 'a', 'a file, not a directory')).status).toBe(200)
    const problem = await body(await chunk(fix.app, session, 'a/b', 'a file under a file'))
    expect([problem['status'], problem['code']]).toEqual([422, 'invalid'])
    expect(String(problem['detail'])).toContain('"a"')
    expect(String(problem['detail'])).toContain('"a/b"')
  })

  it('refuses it in the other order too, the answer being about the pair and not the arrival', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, 'a/b', 'a file under a file')).status).toBe(200)
    expect(await refusal(await chunk(fix.app, session, 'a', 'a file, not a directory'))).toEqual([
      422,
      'invalid',
    ])
  })

  it('leaves the session alone when it refuses the pair: the first file stays, the next is taken', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, 'a', 'first')).status).toBe(200)
    expect((await chunk(fix.app, session, 'a/b', 'refused')).status).toBe(422)
    expect(await body(await chunk(fix.app, session, 'c', 'second'))).toMatchObject({
      path: 'c',
      sessionBytes: 11,
    })
    expect(await staged(fix, session, 'a')).toEqual(new TextEncoder().encode('first'))
  })

  it('takes the next chunk of a file it already stages, which is not the pair being refused', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, 'a/b', 'first ')).status).toBe(200)
    expect(await body(await chunk(fix.app, session, { at: 'a/b', offset: 6 }, 'second'))).toMatchObject({
      sessionBytes: 12,
    })
    expect(await staged(fix, session, 'a/b')).toEqual(new TextEncoder().encode('first second'))
  })

  it('cannot reach the session’s own marker file, whatever an upload calls itself', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, 'session.json', 'not the marker')).status).toBe(200)
    expect(await staged(fix, session, 'session.json')).toEqual(
      new TextEncoder().encode('not the marker'),
    )
    const marker = sessionMarkerFile(ROOT, 'microtask', session)
    expect(JSON.parse((await fix.deps.fileSystem.readText(marker)) ?? 'null')).toEqual({
      openedAt: STAMP,
      bytes: 14,
      paths: ['session.json'],
    })
  })
})

describe('a file larger than the global body limit, uploaded as chunks (ADR 0044)', () => {
  const WHOLE = pattern(GLOBAL_BODY_LIMIT_BYTES + 234_567)

  it('cannot be posted in one request, which is the reason the upload is chunked at all', async () => {
    const { app } = await fixture()
    const session = await opened(app)
    const response = await chunk(app, session, HARVESTED, WHOLE)
    expect(response.status).toBe(413)
    expect(await body(response)).toMatchObject({ maxBytes: GLOBAL_BODY_LIMIT_BYTES })
  })

  it('arrives byte for byte as a sequence of chunks, which is what a migration depends on', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const parts = slices(WHOLE, IMPORT_CHUNK_LIMIT_BYTES)
    expect(parts.length).toBe(5)
    let total = 0
    for (const part of parts) {
      const response = await chunk(fix.app, session, { at: HARVESTED, offset: total }, part)
      total += part.length
      expect([part.length, response.status]).toEqual([part.length, 200])
      expect(await body(response)).toEqual({
        path: HARVESTED,
        chunkBytes: part.length,
        sessionBytes: total,
      })
    }
    const reassembled = (await staged(fix, session, HARVESTED)) ?? new Uint8Array()
    expect(reassembled.length).toBe(WHOLE.length)
    expect(firstDifference(reassembled, WHOLE)).toBe(-1)
  })

  it('carries bytes no UTF-8 round trip would survive, so the comparison above can fail', () => {
    expect(WHOLE.some((byte) => byte > 0x7f)).toBe(true)
    expect(new TextEncoder().encode(new TextDecoder().decode(WHOLE)).length).not.toBe(WHOLE.length)
  })
})

describe('one chunk over the chunk cap', () => {
  it('is refused 413 naming the chunk cap, not the global one both limiters could have named', async () => {
    const { app } = await fixture()
    const session = await opened(app)
    const response = await chunk(app, session, HARVESTED, pattern(IMPORT_CHUNK_LIMIT_BYTES + 1))
    expect(response.status).toBe(413)
    expect(await body(response)).toMatchObject({
      code: 'payload_too_large',
      maxBytes: IMPORT_CHUNK_LIMIT_BYTES,
    })
    expect(IMPORT_CHUNK_LIMIT_BYTES).toBeLessThan(GLOBAL_BODY_LIMIT_BYTES)
  })

  it('takes a chunk of exactly the cap, so the refusal is the boundary and not the route', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const response = await chunk(fix.app, session, HARVESTED, pattern(IMPORT_CHUNK_LIMIT_BYTES))
    expect(await body(response)).toMatchObject({ sessionBytes: IMPORT_CHUNK_LIMIT_BYTES })
  })
})

describe('the session byte cap (ADR 0044)', () => {
  const seed = async (fix: Fixture, session: string, bytes: number): Promise<void> => {
    const at = sessionMarkerFile(ROOT, 'microtask', session)
    const paths = [HARVESTED]
    await fix.deps.fileSystem.writeTextAtomic(at, JSON.stringify({ openedAt: STAMP, bytes, paths }))
  }

  it('takes the chunk that reaches the cap exactly, the total being seeded rather than uploaded', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await seed(fix, session, MAX_SESSION_BYTES - 1)
    const response = await chunk(fix.app, session, HARVESTED, 'x')
    expect(await body(response)).toMatchObject({ sessionBytes: MAX_SESSION_BYTES })
  })

  it('refuses the next chunk, naming the cap and the bytes already staged as two numbers', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await seed(fix, session, MAX_SESSION_BYTES - 1)
    const response = await chunk(fix.app, session, HARVESTED, 'xy')
    expect(response.status).toBe(409)
    const problem = await body(response)
    expect(problem['code']).toBe('conflict')
    expect(String(problem['detail'])).toContain(`already holds ${String(MAX_SESSION_BYTES - 1)}`)
    expect(String(problem['detail'])).toContain(`capped at ${String(MAX_SESSION_BYTES)}`)
  })

  it('is not a 413 naming a chunk cap, because the chunk is not what the operator must change', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await seed(fix, session, MAX_SESSION_BYTES)
    const problem = await body(await chunk(fix.app, session, HARVESTED, 'x'))
    expect([problem['status'], 'maxBytes' in problem]).toEqual([409, false])
  })

  it('writes nothing when it refuses, so a full session does not keep growing', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await seed(fix, session, MAX_SESSION_BYTES)
    await chunk(fix.app, session, HARVESTED, 'x')
    expect(await staged(fix, session, HARVESTED)).toBeNull()
  })
})

describe('the opportunistic sweep (ADR 0045)', () => {
  interface Movable {
    readonly fix: Fixture
    readonly at: (moment: string) => void
    readonly credentials: () => Record<string, string>
  }

  const movable = async (): Promise<Movable> => {
    let moment = STAMP
    const clock: Clock = { now: () => moment }
    const verifier = new AdminVerifier({ config: testConfig, clock })
    return {
      fix: await fixture(clock),
      at: (next) => {
        moment = next
      },
      credentials: () => ({
        'x-api-key': SERVICE_KEY,
        authorization: `Bearer ${verifier.issue().token}`,
      }),
    }
  }

  const after = (millis: number): string => new Date(Date.parse(STAMP) + millis).toISOString()

  it('removes a session older than the TTL when the next one is opened', async () => {
    const { fix, at, credentials } = await movable()
    const stale = await opened(fix.app, credentials())
    await chunk(fix.app, stale, HARVESTED, 'staged and abandoned')
    at(after(SESSION_TTL_MS + 1))
    const fresh = await opened(fix.app, credentials())
    expect(await sessionIds(fix)).toEqual([fresh])
    expect(await staged(fix, stale, HARVESTED)).toBeNull()
    expect(await fix.deps.fileSystem.readText(sessionMarkerFile(ROOT, 'microtask', stale))).toBeNull()
  })

  it('keeps a session of exactly the TTL, so the boundary is stated rather than approximate', async () => {
    const { fix, at, credentials } = await movable()
    const first = await opened(fix.app, credentials())
    at(after(SESSION_TTL_MS))
    const second = await opened(fix.app, credentials())
    expect([...(await sessionIds(fix))].sort()).toEqual([first, second].sort())
  })

  it('keeps every session younger than the TTL, which is what makes the removal above specific', async () => {
    const { fix, at, credentials } = await movable()
    const first = await opened(fix.app, credentials())
    at(after(SESSION_TTL_MS - 1))
    const second = await opened(fix.app, credentials())
    expect([...(await sessionIds(fix))].sort()).toEqual([first, second].sort())
  })

  it('sweeps a marker whose openedAt is not an instant, by the rule rather than by NaN accident', async () => {
    const fix = await fixture()
    const debris = IDS.missing
    await fix.deps.fileSystem.writeTextAtomic(
      sessionMarkerFile(ROOT, 'microtask', debris),
      JSON.stringify({ openedAt: 'tuesday', bytes: 0, paths: [] }),
    )
    expect(await sessionIds(fix)).toEqual([debris])
    const fresh = await opened(fix.app)
    expect(await sessionIds(fix)).toEqual([fresh])
  })

  it('sweeps a directory whose marker will not parse, since no open can be mid-write', async () => {
    const fix = await fixture()
    const debris = IDS.missing
    await fix.deps.fileSystem.writeTextAtomic(
      sessionMarkerFile(ROOT, 'microtask', debris),
      'not json at all',
    )
    expect(await sessionIds(fix)).toEqual([debris])
    const fresh = await opened(fix.app)
    expect(await sessionIds(fix)).toEqual([fresh])
  })

  it('leaves a name that is not a ULID alone, having no guarded path with which to remove it', async () => {
    const fix = await fixture()
    const at = `${stagingDir(ROOT, 'microtask', IDS.missing)}`.replace(IDS.missing, 'not-a-session')
    await fix.deps.fileSystem.writeTextAtomic(`${at}/something.json`, '{}')
    const fresh = await opened(fix.app)
    expect([...(await sessionIds(fix))].sort()).toEqual(['not-a-session', fresh].sort())
  })
})

describe('the chunk offset, which closes the retry gap the upload left open', () => {
  const detail = async (response: Response): Promise<string> =>
    String((await body(response))['detail'])

  it('takes a first chunk at offset 0, a file nothing has been appended to holding no bytes', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, HARVESTED, 'first')).status).toBe(200)
  })

  it('refuses a retry of a chunk that already landed, which is the append that corrupted the file', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, HARVESTED, '{"id":1}')).status).toBe(200)
    const retry = await chunk(fix.app, session, HARVESTED, '{"id":1}')
    expect(await refusal(retry)).toEqual([409, 'conflict'])
    expect(await staged(fix, session, HARVESTED)).toEqual(new TextEncoder().encode('{"id":1}'))
  })

  it('names the offset to resume from, which is what turns a retry into a resumption', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await chunk(fix.app, session, HARVESTED, 'six!!!')
    const why = await detail(await chunk(fix.app, session, HARVESTED, 'more'))
    expect(why).toContain('starts at offset 6')
    expect(why).toContain('not at 0')
  })

  it('leaves the session’s byte total untouched when it refuses, which is the harm being closed', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const first = await body(await chunk(fix.app, session, HARVESTED, 'six!!!'))
    expect(first['sessionBytes']).toBe(6)
    expect((await chunk(fix.app, session, HARVESTED, 'six!!!')).status).toBe(409)
    const next = await body(await chunk(fix.app, session, { at: HARVESTED, offset: 6 }, 'seven!!'))
    expect(next['sessionBytes']).toBe(13)
  })

  it('refuses an offset past the end as readily as one before it, so no gap can be left in a file', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await chunk(fix.app, session, HARVESTED, 'six!!!')
    expect((await chunk(fix.app, session, { at: HARVESTED, offset: 99 }, 'ahead')).status).toBe(409)
    expect(await staged(fix, session, HARVESTED)).toEqual(new TextEncoder().encode('six!!!'))
  })

  it('measures the offset in bytes and not characters, so a multi-byte name cannot shift it', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const head = new TextEncoder().encode('{"name":"Ärendehantering 日本語"')
    expect(head.length).toBeGreaterThan([...'{"name":"Ärendehantering 日本語"'].length)
    expect((await chunk(fix.app, session, HARVESTED, head)).status).toBe(200)
    expect((await chunk(fix.app, session, { at: HARVESTED, offset: head.length }, '}')).status).toBe(200)
    expect(await staged(fix, session, HARVESTED)).toEqual(
      new TextEncoder().encode('{"name":"Ärendehantering 日本語"}'),
    )
  })

  it('refuses a request that names no offset at all, rather than assuming one', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const response = await fix.app.request(`${SESSIONS}/${session}/files?path=${HARVESTED}`, {
      method: 'POST',
      headers: { ...admin(), 'content-type': OCTETS },
      body: 'a chunk',
    })
    expect(response.status).toBe(422)
    expect((await body(response))['errors']).toMatchObject([{ path: 'offset' }])
  })

  it('refuses a negative offset in the validator, before any path is resolved from it', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, { at: HARVESTED, offset: -1 }, 'x')).status).toBe(422)
    expect(await sessionIds(fix)).toEqual([session])
  })

  it('answers the offset check before it reads a path whose ancestor is a file, keeping that a 422', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await chunk(fix.app, session, 'a', 'a file, not a directory')).status).toBe(200)
    expect(await refusal(await chunk(fix.app, session, 'a/b', 'inside it'))).toEqual([422, 'invalid'])
  })
})
