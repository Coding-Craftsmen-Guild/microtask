import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Service {
  readonly build?: { readonly context?: string; readonly dockerfile?: string }
  readonly environment?: Readonly<Record<string, string>>
  readonly volumes?: readonly string[]
  readonly ports?: unknown
  readonly depends_on?: Readonly<Record<string, { readonly condition?: string }>>
  readonly healthcheck?: unknown
}

interface Compose {
  readonly services: Readonly<Record<string, Service>>
  readonly volumes?: Readonly<Record<string, Readonly<Record<string, unknown>> | null>>
}

const read = (name: string): string => readFileSync(new URL(`../../../../${name}`, import.meta.url), 'utf8')

const TEXT = read('docker-compose.yml')
const COMPOSE = parse(TEXT) as Compose
const { api, microtask, macroplan } = COMPOSE.services as Record<'api' | 'microtask' | 'macroplan', Service>

const APPS: readonly (readonly [string, Service, string])[] = [
  ['microtask', microtask, 'MICROTASK'],
  ['macroplan', macroplan, 'MACROPLAN'],
]

const SECRETS = [
  'ADMIN_PASSWORD',
  'SESSION_SECRET',
  'MICROTASK_API_KEY',
  'COOKIE_SECRET',
  'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
  'MACROPLAN_API_KEY',
  'MACROPLAN_COOKIE_SECRET',
  'MACROPLAN_SERVER_ACTIONS_ENCRYPTION_KEY',
]

const interpolations = (text: string): string[] => [...text.matchAll(/\$\{[^}]*\}|\$[A-Za-z_]\w*/g)].map((m) => m[0])
const variablesIn = (value: string | undefined): string[] =>
  [...(value ?? '').matchAll(/\$\{([A-Za-z_]\w*)/g)].map((m) => m[1] ?? '')

describe('docker-compose.yml', () => {
  it('runs the api and both apps, each from its own Dockerfile with the repository root as context', () => {
    expect(Object.keys(COMPOSE.services).sort()).toEqual(['api', 'macroplan', 'microtask'])
    expect(api.build).toEqual({ context: '.', dockerfile: 'apps/api/Dockerfile' })
    for (const [name, service] of APPS) {
      expect(service.build, name).toEqual({ context: '.', dockerfile: `apps/${name}/Dockerfile` })
    }
  })

  it('publishes no port on any service: the API is internal-only (ADR 0041) and Coolify routes by domain', () => {
    for (const service of Object.values(COMPOSE.services)) expect(service.ports).toBeUndefined()
  })

  it('gives the API a new named volume at DATA_DIR, and nothing else a volume', () => {
    expect(api.volumes).toEqual(['api-data:/data'])
    expect(api.environment?.DATA_DIR).toBe('/data')
    for (const [name, service] of APPS) expect(service.volumes, name).toBeUndefined()
  })

  it('never references the live volume: api-data is not external, not renamed, and the legacy name is absent', () => {
    expect(COMPOSE.volumes).toEqual({ 'api-data': null })
    expect(TEXT).not.toMatch(/^\s*(external|name):/m)
    expect(TEXT).not.toContain('microtask-data')
  })

  it('starts each app only once the api reports healthy, on the probe its image carries', () => {
    for (const [name, service] of APPS) {
      expect(service.depends_on, name).toEqual({ api: { condition: 'service_healthy' } })
    }
    expect(api.healthcheck).toBeUndefined()
  })

  it('refuses to start without every secret: each interpolation is ${VAR:?message}, never a default', () => {
    const found = interpolations(TEXT)
    expect(found.length).toBeGreaterThanOrEqual(SECRETS.length)
    for (const each of found) expect(each).toMatch(/^\$\{[A-Z_]+:\?[^}]+\}$/)
    expect([...new Set(found.flatMap(variablesIn))].sort()).toEqual([...SECRETS].sort())
  })

  it('takes every credential from the environment, never a literal in the file', () => {
    expect(variablesIn(api.environment?.ADMIN_PASSWORD)).toHaveLength(1)
    expect(variablesIn(api.environment?.SESSION_SECRET)).toHaveLength(1)
    expect(variablesIn(api.environment?.SERVICE_KEYS)).toEqual(['MICROTASK_API_KEY', 'MACROPLAN_API_KEY'])
    for (const [name, service] of APPS) {
      for (const key of ['API_KEY', 'COOKIE_SECRET', 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY']) {
        expect(variablesIn(service.environment?.[key]), `${name}.${key}`).toHaveLength(1)
      }
    }
  })

  it('feeds the API each service key and that app its API_KEY from one variable, so they cannot drift', () => {
    expect(api.environment?.SERVICE_KEYS).toMatch(/^microtask=\$\{MICROTASK_API_KEY:\?[^}]+\},macroplan=\$\{MACROPLAN_API_KEY:\?/)
    for (const [name, service, prefix] of APPS) {
      expect(variablesIn(service.environment?.API_KEY), name).toEqual([`${prefix}_API_KEY`])
      expect(service.environment?.API_BASE_URL, name).toBe('http://api:4321')
    }
  })

  it('gives the two apps different keys, cookie secrets and action keys, so neither can read the other (ADR 0014)', () => {
    const named = (service: Service, key: string): string => variablesIn(service.environment?.[key])[0] ?? ''
    for (const key of ['API_KEY', 'COOKIE_SECRET', 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY']) {
      expect(named(microtask, key), key).not.toBe(named(macroplan, key))
    }
  })
})

describe('.env.example', () => {
  it('lists exactly the variables compose needs, each empty, so copying it unchanged is refused', () => {
    const entries = read('.env.example')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    expect(entries.sort()).toEqual(SECRETS.map((name) => `${name}=`).sort())
  })
})
