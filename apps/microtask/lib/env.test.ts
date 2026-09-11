import { afterEach, describe, expect, it, vi } from 'vitest'
import { MIN_COOKIE_SECRET_BYTES, readEnv } from './env'
import type * as EnvModule from './env'

const secret = 'a'.repeat(MIN_COOKIE_SECRET_BYTES)

const complete = {
  API_BASE_URL: 'http://api.internal:4321',
  API_KEY: 'service-key',
  COOKIE_SECRET: secret,
}

describe('readEnv', () => {
  it('reads the three values the app needs from the object it was handed', () => {
    expect(readEnv(complete)).toEqual({
      apiBaseUrl: 'http://api.internal:4321',
      apiKey: 'service-key',
      cookieSecret: secret,
    })
  })

  it('requires the cookie secret to be at least 32 bytes', () => {
    const short = { ...complete, COOKIE_SECRET: 'a'.repeat(31) }
    expect(() => readEnv(short)).toThrow(/COOKIE_SECRET/)
  })

  it('accepts exactly 32 bytes, so the bound is not off by one', () => {
    expect(() => readEnv({ ...complete, COOKIE_SECRET: 'a'.repeat(32) })).not.toThrow()
  })

  it('measures the secret in bytes, not in UTF-16 code units', () => {
    const sixteenEuroSigns = '€'.repeat(16)
    expect(sixteenEuroSigns.length).toBe(16)
    expect(Buffer.byteLength(sixteenEuroSigns)).toBe(48)
    expect(() => readEnv({ ...complete, COOKIE_SECRET: sixteenEuroSigns })).not.toThrow()
  })

  it('refuses a secret that is short in bytes even when it is long in code units', () => {
    const twoByteRun = 'é'.repeat(15)
    expect(twoByteRun.length).toBe(15)
    expect(Buffer.byteLength(twoByteRun)).toBe(30)
    expect(() => readEnv({ ...complete, COOKIE_SECRET: twoByteRun })).toThrow(/COOKIE_SECRET/)
  })

  it.each(['API_BASE_URL', 'API_KEY', 'COOKIE_SECRET'])('refuses a missing %s', (key) => {
    const rest = Object.fromEntries(Object.entries(complete).filter(([name]) => name !== key))
    expect(() => readEnv(rest)).toThrow(new RegExp(key))
  })

  it.each(['API_BASE_URL', 'API_KEY', 'COOKIE_SECRET'])('refuses a blank %s', (key) => {
    expect(() => readEnv({ ...complete, [key]: '   ' })).toThrow(new RegExp(key))
  })
})

describe('appEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const fresh = async (): Promise<typeof EnvModule> => {
    vi.resetModules()
    return import('./env')
  }

  it('reads the three values from process.env', async () => {
    vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
    vi.stubEnv('API_KEY', 'service-key')
    vi.stubEnv('COOKIE_SECRET', secret)
    const { appEnv } = await fresh()
    expect(appEnv()).toEqual({ apiBaseUrl: 'http://api.internal:4321', apiKey: 'service-key', cookieSecret: secret })
  })

  it('validates what it reads, so a short secret in the environment throws', async () => {
    vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
    vi.stubEnv('API_KEY', 'service-key')
    vi.stubEnv('COOKIE_SECRET', 'a'.repeat(31))
    const { appEnv } = await fresh()
    expect(() => appEnv()).toThrow(/COOKIE_SECRET/)
  })

  it('refuses an environment with no API key', async () => {
    vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
    vi.stubEnv('API_KEY', '')
    vi.stubEnv('COOKIE_SECRET', secret)
    const { appEnv } = await fresh()
    expect(() => appEnv()).toThrow(/API_KEY/)
  })
})
