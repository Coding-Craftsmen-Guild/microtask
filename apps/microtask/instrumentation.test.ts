import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const boot = async (): Promise<void> => {
  vi.resetModules()
  const { register } = await import('./instrumentation')
  register()
}

let exited: number[]
let logged: string[]

beforeEach(() => {
  exited = []
  logged = []
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exited.push(code ?? 0)
  }) as unknown as typeof process.exit)
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '))
  })
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a'.repeat(32))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('register, which Next calls once when the server boots', () => {
  it('kills the process on a 31-byte COOKIE_SECRET rather than serving 500s behind a healthy container', async () => {
    vi.stubEnv('COOKIE_SECRET', 'a'.repeat(31))
    await boot()
    expect(exited).toEqual([1])
  })

  it.each(['API_BASE_URL', 'API_KEY', 'COOKIE_SECRET'])('exits non-zero with no %s', async (key) => {
    vi.stubEnv(key, '')
    await boot()
    expect(exited).toEqual([1])
  })

  it('says which variable it refused on before it goes, so the crash is diagnosable from the logs', async () => {
    vi.stubEnv('API_KEY', '')
    await boot()
    expect(logged.join('\n')).toMatch(/API_KEY/)
  })

  it('boots on a complete environment, and kills nothing', async () => {
    await expect(boot()).resolves.toBeUndefined()
    expect(exited).toEqual([])
    expect(logged).toEqual([])
  })

  it('throws instead, where the runtime has no process.exit, rather than passing a refusal off as a boot', async () => {
    vi.stubEnv('COOKIE_SECRET', 'a'.repeat(31))
    vi.stubGlobal('process', { ...process, exit: undefined })
    await expect(boot()).rejects.toThrow(/COOKIE_SECRET/)
    vi.unstubAllGlobals()
  })
})
