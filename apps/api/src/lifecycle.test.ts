import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { Agent, get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve, type ServerType } from '@hono/node-server'
import { Hono } from 'hono'
import { manifest } from '@repo/microtask-domain/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readConfig } from './config.js'
import { drainServer, onStopSignal } from './lifecycle.js'
import { buildRuntimeDeps } from './runtime.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'

const configFor = (dataDir: string) =>
  readConfig({
    DATA_DIR: dataDir,
    ADMIN_PASSWORD: 'correct horse battery staple',
    SESSION_SECRET: 's'.repeat(32),
    BRIDGE_SECRET: 'b'.repeat(32),
    SERVICE_KEYS: 'microtask=k-microtask',
  })

interface Deferred {
  readonly promise: Promise<void>
  readonly resolve: () => void
}

const deferred = (): Deferred => {
  let resolve = (): void => undefined
  const promise = new Promise<void>((settle) => {
    resolve = () => {
      settle()
    }
  })
  return { promise, resolve }
}

const listen = (app: Hono): Promise<{ server: ServerType; port: number }> => {
  const ports: number[] = []
  const server = serve({ fetch: app.fetch, port: 0 }, (info) => ports.push(info.port))
  return vi.waitFor(() => {
    expect(ports).toHaveLength(1)
    return { server, port: ports[0] as number }
  })
}

const fetchThrough = (port: number, agent: Agent): Promise<string> =>
  new Promise((resolve, reject) => {
    get({ port, path: '/', agent }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => {
        body += chunk
      })
      response.on('end', () => {
        resolve(body)
      })
    }).on('error', reject)
  })

let root: string
let exits: number[]
let started: ServerType[]
let dispose: (() => void)[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'api-lifecycle-'))
  exits = []
  started = []
  dispose = []
})

afterEach(async () => {
  for (const stop of dispose) stop()
  for (const server of started) await drainServer(server).catch(() => undefined)
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const running = async (app: Hono): Promise<{ server: ServerType; port: number }> => {
  const handle = await listen(app)
  started.push(handle.server)
  dispose.push(
    onStopSignal(handle.server, (code) => {
      exits.push(code)
    }),
  )
  return handle
}

describe('a stop signal, which docker stop sends before it resorts to SIGKILL', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)('closes the listening socket and exits 0 on %s', async (signal) => {
    const app = new Hono().get('/', (c) => c.text('serving'))
    const { port } = await running(app)
    expect(await fetch(`http://127.0.0.1:${String(port)}/`).then((r) => r.text())).toBe('serving')

    process.emit(signal)

    await vi.waitFor(() => {
      expect(exits).toEqual([0])
    })
    await expect(fetch(`http://127.0.0.1:${String(port)}/`)).rejects.toThrow()
  })

  it('exits once on a second signal rather than closing a closed server', async () => {
    await running(new Hono().get('/', (c) => c.text('serving')))

    process.emit('SIGTERM')
    process.emit('SIGINT')
    await vi.waitFor(() => {
      expect(exits).toEqual([0])
    })

    process.emit('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(exits).toEqual([0])
  })

  it('exits non-zero when the drain fails, rather than reporting a stop that never happened', async () => {
    const handle = await listen(new Hono().get('/', (c) => c.text('serving')))
    await drainServer(handle.server)
    dispose.push(
      onStopSignal(handle.server, (code) => {
        exits.push(code)
      }),
    )

    process.emit('SIGTERM')

    await vi.waitFor(() => {
      expect(exits).toEqual([1])
    })
  })

  it('closes an idle keep-alive connection, so a pooling client cannot hold the stop open', async () => {
    const agent = new Agent({ keepAlive: true, maxSockets: 1 })
    const { port } = await running(new Hono().get('/', (c) => c.text('serving')))
    expect(await fetchThrough(port, agent)).toBe('serving')

    process.emit('SIGTERM')

    await vi.waitFor(
      () => {
        expect(exits).toEqual([0])
      },
      { timeout: 2000 },
    )
    agent.destroy()
  })

  it('does not abandon a write already holding the lock, and answers it before it exits', async () => {
    const deps = buildRuntimeDeps(configFor(root))
    const reached = deferred()
    const release = deferred()
    const app = new Hono().get('/', async (c) => {
      const body = await deps.lock.run(async () => {
        reached.resolve()
        await release.promise
        await deps.store.saveManifest('microtask', manifest(P1))
        return 'written'
      })
      return c.text(body)
    })
    const { port } = await running(app)
    const inFlight = fetch(`http://127.0.0.1:${String(port)}/`).then((r) => r.text())
    await reached.promise

    process.emit('SIGTERM')
    await expect(fetch(`http://127.0.0.1:${String(port)}/`)).rejects.toThrow()
    expect(exits).toEqual([])

    release.resolve()
    expect(await inFlight).toBe('written')
    expect(existsSync(join(root, 'microtask', 'projects', P1, 'project.json'))).toBe(true)
    await vi.waitFor(() => {
      expect(exits).toEqual([0])
    })
  })
})

describe('drainServer', () => {
  it('unrefs its idle sweep, so the sweep itself can never be what holds the process open', async () => {
    const handle = await listen(new Hono().get('/', (c) => c.text('serving')))
    const timers: { hasRef: () => boolean }[] = []
    const real = globalThis.setInterval.bind(globalThis)
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((work: () => void, ms: number) => {
      const timer = real(work, ms)
      timers.push(timer as unknown as { hasRef: () => boolean })
      return timer
    }) as typeof globalThis.setInterval)

    await drainServer(handle.server)

    expect(timers).toHaveLength(1)
    expect(timers[0]?.hasRef()).toBe(false)
  })

  it('resolves once, and rejects a second drain rather than reporting a clean stop twice', async () => {
    const handle = await listen(new Hono().get('/', (c) => c.text('serving')))
    await expect(drainServer(handle.server)).resolves.toBeUndefined()
    await expect(drainServer(handle.server)).rejects.toThrow()
  })
})

describe('server.ts, which no test can import because it calls serve() at module scope', () => {
  const source = readFileSync(new URL('./server.ts', import.meta.url), 'utf8')

  it('installs the stop on the server it listens with, and exits the process with the code it is given', () => {
    expect(source).toMatch(/const server = serve\(/)
    expect(source).toMatch(/onStopSignal\(server, \(code\) => \{/)
    expect(source).toMatch(/process\.exit\(code\)/)
  })
})

describe('onStopSignal', () => {
  it('removes its handlers when disposed, so a test process is not left listening for signals', async () => {
    const before = process.listenerCount('SIGTERM')
    const handle = await listen(new Hono().get('/', (c) => c.text('serving')))
    const stop = onStopSignal(handle.server, (code) => {
      exits.push(code)
    })
    expect(process.listenerCount('SIGTERM')).toBe(before + 1)
    stop()
    expect(process.listenerCount('SIGTERM')).toBe(before)

    process.emit('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(exits).toEqual([])
    await drainServer(handle.server)
  })
})
