import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const boot = async (): Promise<void> => {
  vi.resetModules()
  const { register } = await import('./instrumentation')
  register()
}

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a'.repeat(32))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('register, which Next calls once when the server boots', () => {
  it('refuses to boot on a 31-byte COOKIE_SECRET', async () => {
    vi.stubEnv('COOKIE_SECRET', 'a'.repeat(31))
    await expect(boot()).rejects.toThrow(/COOKIE_SECRET/)
  })

  it.each(['API_BASE_URL', 'API_KEY', 'COOKIE_SECRET'])('refuses to boot with no %s', async (key) => {
    vi.stubEnv(key, '')
    await expect(boot()).rejects.toThrow(new RegExp(key))
  })

  it('boots on a complete environment', async () => {
    await expect(boot()).resolves.toBeUndefined()
  })
})
