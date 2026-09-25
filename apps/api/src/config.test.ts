import { describe, expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import { readConfig, type Env } from './config.js'

const SECRET = 'a'.repeat(32)
const BRIDGE_SECRET = 'c'.repeat(32)

const complete: Env = {
  DATA_DIR: '/srv/data',
  ADMIN_PASSWORD: 'correct horse battery',
  SESSION_SECRET: SECRET,
  BRIDGE_SECRET,
  SERVICE_KEYS: 'microtask=k-microtask,macroplan=k-macroplan',
  PORT: '8080',
  ADMIN_TOKEN_TTL_SECONDS: '900',
}

const withKey = (key: string, value: string): Env => ({ ...complete, [key]: value })

const without = (key: string): Env =>
  Object.fromEntries(Object.entries(complete).filter(([name]) => name !== key))

const REQUIRED = ['DATA_DIR', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'BRIDGE_SECRET', 'SERVICE_KEYS']

describe('readConfig', () => {
  it('reads every value from the env argument it was given, never from process.env', () => {
    const config = readConfig(complete)
    expect(config.dataDir).toBe('/srv/data')
    expect(config.adminPassword).toBe('correct horse battery')
    expect(config.sessionSecret).toBe(SECRET)
    expect(config.bridgeSecret).toBe(BRIDGE_SECRET)
    expect(config.port).toBe(8080)
    expect(config.adminTokenTtlSeconds).toBe(900)
  })

  it('ignores env entries it does not know about, so an unrelated variable cannot break startup', () => {
    expect(readConfig({ ...complete, PATH: '/usr/bin', NODE_ENV: 'production' }).port).toBe(8080)
  })

  describe('required keys', () => {
    for (const key of REQUIRED) {
      it(`throws Invalid naming ${key} when ${key} is absent`, () => {
        expect(() => readConfig(without(key))).toThrow(Invalid)
        expect(() => readConfig(without(key))).toThrow(key)
      })

      it(`throws Invalid naming ${key} when ${key} is the empty string`, () => {
        expect(() => readConfig(withKey(key, ''))).toThrow(Invalid)
        expect(() => readConfig(withKey(key, ''))).toThrow(key)
      })

      it(`throws Invalid naming ${key} when ${key} is only whitespace`, () => {
        expect(() => readConfig(withKey(key, '   '))).toThrow(Invalid)
        expect(() => readConfig(withKey(key, '   '))).toThrow(key)
      })
    }

    it('reports a missing key as kernel Invalid, so the API answers 422 rather than a bare 500', () => {
      try {
        readConfig(without('DATA_DIR'))
        expect.unreachable('readConfig accepted an env with no DATA_DIR')
      } catch (error) {
        expect(error).toBeInstanceOf(Invalid)
        expect((error as Invalid).status).toBe(422)
        expect((error as Invalid).code).toBe('invalid')
      }
    })
  })

  describe('ADMIN_PASSWORD, which has no default', () => {
    it('refuses to produce a config without it, the way legacy refuses to start (server.js:17)', () => {
      expect(() => readConfig(without('ADMIN_PASSWORD'))).toThrow(/ADMIN_PASSWORD is required/)
    })

    it('does not trim it, because a trailing space is part of a secret and not noise', () => {
      expect(readConfig(withKey('ADMIN_PASSWORD', ' spaced ')).adminPassword).toBe(' spaced ')
    })

    it('accepts a password shorter than 8, because legacy warns about that and still starts', () => {
      expect(readConfig(withKey('ADMIN_PASSWORD', 'short')).adminPassword).toBe('short')
    })
  })

  describe('SESSION_SECRET', () => {
    it('rejects a secret under 32 characters, naming the key', () => {
      expect(() => readConfig(withKey('SESSION_SECRET', 'a'.repeat(31)))).toThrow(/SESSION_SECRET/)
      expect(() => readConfig(withKey('SESSION_SECRET', 'a'.repeat(31)))).toThrow(Invalid)
    })

    it('accepts a secret of exactly 32 characters', () => {
      expect(readConfig(withKey('SESSION_SECRET', 'b'.repeat(32))).sessionSecret).toBe('b'.repeat(32))
    })

    it('does not put the secret itself in the error message', () => {
      const bad = 'z'.repeat(31)
      expect(() => readConfig(withKey('SESSION_SECRET', bad))).toThrow(
        expect.objectContaining({ message: expect.not.stringContaining(bad) as unknown as string }),
      )
    })
  })

  describe('BRIDGE_SECRET, which has no default', () => {
    it('refuses to produce a config without it, matching how ADMIN_PASSWORD is handled', () => {
      expect(() => readConfig(without('BRIDGE_SECRET'))).toThrow(/BRIDGE_SECRET is required/)
    })

    // The floor is SESSION_SECRET's, applied to this key for the reason ApiConfig's own TSDoc
    // gives: `seal` derives its AES key as sha256(secret), so a short secret produces a
    // full-length key carrying a short string's entropy, and no caller downstream can tell.
    // ADMIN_PASSWORD is the one secret without a floor, and its exemption is about not locking
    // out a deployment that already had a shorter password — no deployment has this key yet.
    it('refuses a secret below the 32-character floor, which is where a weak AES key comes from', () => {
      expect(() => readConfig(withKey('BRIDGE_SECRET', 'short'))).toThrow(
        /BRIDGE_SECRET must be at least 32 characters/,
      )
      expect(() => readConfig(withKey('BRIDGE_SECRET', 'z'.repeat(31)))).toThrow(/BRIDGE_SECRET/)
      expect(readConfig(withKey('BRIDGE_SECRET', 'z'.repeat(32))).bridgeSecret).toBe('z'.repeat(32))
    })

    it('keeps the rejected secret out of the message, as SESSION_SECRET does', () => {
      const bad = 'y'.repeat(31)
      expect(() => readConfig(withKey('BRIDGE_SECRET', bad))).toThrow(
        expect.objectContaining({ message: expect.not.stringContaining(bad) as unknown as string }),
      )
    })

    it('does not trim it, because a surrounding space is part of a secret and not noise', () => {
      const spaced = ` ${'s'.repeat(32)} `
      expect(readConfig(withKey('BRIDGE_SECRET', spaced)).bridgeSecret).toBe(spaced)
    })
  })

  describe('SERVICE_KEYS, the x-api-key to service-identity map (ADR 0012)', () => {
    it('maps each key to the service that presents it, so a request resolves a service not a boolean', () => {
      const { serviceKeys } = readConfig(complete)
      expect(serviceKeys.get('k-microtask')).toBe('microtask')
      expect(serviceKeys.get('k-macroplan')).toBe('macroplan')
      expect(serviceKeys.size).toBe(2)
    })

    it('reads a single entry', () => {
      expect(readConfig(withKey('SERVICE_KEYS', 'ci=k-ci')).serviceKeys.get('k-ci')).toBe('ci')
    })

    it('splits on the first = only, so a base64 key keeping its padding survives', () => {
      const config = readConfig(withKey('SERVICE_KEYS', 'microtask=YWJjZGU='))
      expect(config.serviceKeys.get('YWJjZGU=')).toBe('microtask')
    })

    it('trims the service name but never the key, because the key is a secret', () => {
      const config = readConfig(withKey('SERVICE_KEYS', ' microtask =k-one'))
      expect(config.serviceKeys.get('k-one')).toBe('microtask')
    })

    it('rejects a key with surrounding whitespace rather than silently never matching it', () => {
      expect(() => readConfig(withKey('SERVICE_KEYS', 'microtask= k-one'))).toThrow(Invalid)
      expect(() => readConfig(withKey('SERVICE_KEYS', 'microtask=k-one '))).toThrow(Invalid)
    })

    it('rejects an entry with no =, naming its position rather than echoing the entry', () => {
      expect(() => readConfig(withKey('SERVICE_KEYS', 'microtask=k-one,oops'))).toThrow(/entry 2/)
      expect(() => readConfig(withKey('SERVICE_KEYS', 'microtask=k-one,oops'))).toThrow(
        expect.objectContaining({ message: expect.not.stringContaining('oops') as unknown as string }),
      )
    })

    it('rejects an entry with an empty service name', () => {
      expect(() => readConfig(withKey('SERVICE_KEYS', '=k-one'))).toThrow(Invalid)
    })

    it('rejects an entry with an empty key', () => {
      expect(() => readConfig(withKey('SERVICE_KEYS', 'microtask='))).toThrow(Invalid)
    })

    it('rejects a trailing comma rather than reading an empty entry', () => {
      expect(() => readConfig(withKey('SERVICE_KEYS', 'microtask=k-one,'))).toThrow(Invalid)
    })

    it('rejects two services sharing one key, because then x-api-key identifies neither', () => {
      expect(() => readConfig(withKey('SERVICE_KEYS', 'a=same,b=same'))).toThrow(/SERVICE_KEYS/)
      expect(() => readConfig(withKey('SERVICE_KEYS', 'a=same,b=same'))).toThrow(Invalid)
    })

    it('rejects one service named twice, because the second entry would silently shadow the first', () => {
      expect(() => readConfig(withKey('SERVICE_KEYS', 'a=k-one,a=k-two'))).toThrow(Invalid)
    })

    it('is a Map, so a key spelled __proto__ is an entry and not a prototype write', () => {
      const { serviceKeys } = readConfig(withKey('SERVICE_KEYS', 'evil=__proto__'))
      expect(serviceKeys.get('__proto__')).toBe('evil')
      expect(serviceKeys.get('constructor')).toBeUndefined()
      expect(serviceKeys.get('toString')).toBeUndefined()
    })
  })

  describe('numbers, which must never become NaN', () => {
    it('rejects a non-numeric PORT instead of listening on a random port, which Number(NaN) gives', () => {
      expect(() => readConfig(withKey('PORT', 'abc'))).toThrow(Invalid)
      expect(() => readConfig(withKey('PORT', 'abc'))).toThrow(/PORT/)
    })

    it('rejects a number with a trailing suffix rather than parsing its prefix', () => {
      expect(() => readConfig(withKey('PORT', '8080abc'))).toThrow(Invalid)
    })

    it('rejects hexadecimal, which Number() would silently accept as a different number', () => {
      expect(() => readConfig(withKey('PORT', '0x1f90'))).toThrow(Invalid)
    })

    it('rejects exponent notation, which Number() would silently accept', () => {
      expect(() => readConfig(withKey('PORT', '8e3'))).toThrow(Invalid)
    })

    it('rejects a fractional port', () => {
      expect(() => readConfig(withKey('PORT', '80.5'))).toThrow(Invalid)
    })

    it('rejects a negative port', () => {
      expect(() => readConfig(withKey('PORT', '-1'))).toThrow(Invalid)
    })

    it('rejects port 0, which would bind an arbitrary free port', () => {
      expect(() => readConfig(withKey('PORT', '0'))).toThrow(Invalid)
    })

    it('rejects a port above 65535', () => {
      expect(() => readConfig(withKey('PORT', '65536'))).toThrow(Invalid)
    })

    it('accepts the boundary ports', () => {
      expect(readConfig(withKey('PORT', '1')).port).toBe(1)
      expect(readConfig(withKey('PORT', '65535')).port).toBe(65535)
    })

    it('tolerates surrounding whitespace on a number, which a .env file adds easily', () => {
      expect(readConfig(withKey('PORT', ' 8080 ')).port).toBe(8080)
    })

    it('rejects a TTL of 0, so a token cannot be minted already expired', () => {
      expect(() => readConfig(withKey('ADMIN_TOKEN_TTL_SECONDS', '0'))).toThrow(Invalid)
    })

    it('rejects a TTL over a day, because ADR 0012 calls the admin token short-lived', () => {
      expect(() => readConfig(withKey('ADMIN_TOKEN_TTL_SECONDS', '86401'))).toThrow(Invalid)
      expect(readConfig(withKey('ADMIN_TOKEN_TTL_SECONDS', '86400')).adminTokenTtlSeconds).toBe(86400)
    })

    it('rejects a malformed TTL, naming that key rather than PORT', () => {
      expect(() => readConfig(withKey('ADMIN_TOKEN_TTL_SECONDS', 'soon'))).toThrow(
        /ADMIN_TOKEN_TTL_SECONDS/,
      )
    })
  })

  describe('defaults, which exist only where a default is safe', () => {
    it('defaults PORT to legacy 4321 when absent', () => {
      expect(readConfig(without('PORT')).port).toBe(4321)
    })

    it('defaults PORT when it is blank, the way legacy PORT || 4321 does', () => {
      expect(readConfig(withKey('PORT', '')).port).toBe(4321)
      expect(readConfig(withKey('PORT', '  ')).port).toBe(4321)
    })

    it('defaults the admin token TTL to an hour when absent', () => {
      expect(readConfig(without('ADMIN_TOKEN_TTL_SECONDS')).adminTokenTtlSeconds).toBe(3600)
    })

    it('gives DATA_DIR no default, because a wrong cwd would silently serve an empty store', () => {
      expect(() => readConfig(without('DATA_DIR'))).toThrow(/DATA_DIR/)
    })

    it('gives SESSION_SECRET no default, because a shipped signing key forges admin tokens', () => {
      expect(() => readConfig(without('SESSION_SECRET'))).toThrow(/SESSION_SECRET/)
    })

    it('gives BRIDGE_SECRET no default, because a shipped key would seal every binding readably', () => {
      expect(() => readConfig(without('BRIDGE_SECRET'))).toThrow(/BRIDGE_SECRET/)
    })

    it('gives SERVICE_KEYS no default, because an empty map must not mean "allow anything"', () => {
      expect(() => readConfig(without('SERVICE_KEYS'))).toThrow(/SERVICE_KEYS/)
    })
  })
})
