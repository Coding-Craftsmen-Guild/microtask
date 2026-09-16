import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const API = dirname(fileURLToPath(import.meta.url))
const APP = join(API, '..')

const routeFiles = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const next = join(directory, entry.name)
    if (entry.isDirectory()) return routeFiles(next)
    return entry.name === 'route.ts' ? [relative(APP, next).replaceAll('\\', '/')] : []
  })

const THREE = [
  'api/export/route.ts',
  'api/import/upload/route.ts',
  'api/projects/[projectId]/tasks/[taskId]/tabs/[tabId]/document/route.ts',
]

const read = (file: string): string => readFileSync(join(APP, file), 'utf8')

describe('ADR 0015: the app has exactly three route handlers under /api, and these three', () => {
  it('has these and no fourth, because everything else is a Server Action', () => {
    expect([...routeFiles(API)].sort()).toEqual([...THREE].sort())
  })

  it('serves the export as a GET, which is the one an action cannot answer at all', () => {
    expect(read('api/export/route.ts')).toMatch(/export async function GET\(/)
  })

  it('serves the upload as a POST, because an action body caps at 1 MB', () => {
    expect(read('api/import/upload/route.ts')).toMatch(/export async function POST\(/)
  })

  it('serves the document write as a PUT, forwarding the conditional write (ADR 0016)', () => {
    expect(read(THREE[2] ?? '')).toMatch(/export async function PUT\(/)
  })
})

describe('each handler establishes its own authority, since proxy.ts passes /api/* ungated', () => {
  it.each(THREE)('reads a credential in %s rather than trusting the proxy', (file) => {
    const source = read(file)
    expect(source).toMatch(/apiForSession|client:/)
  })

  it.each(['api/export/route.ts', 'api/import/upload/route.ts'])(
    'answers %s 401 when there is no admin client to build',
    (file) => {
      expect(read(file)).toMatch(/status: 401/)
    },
  )
})

describe('the link surface keeps its own twin of the one handler it needs, and no other', () => {
  it('has exactly one route handler under /s, which is the document write (ADR 0040)', () => {
    expect([...routeFiles(join(APP, 's'))]).toEqual([
      's/[token]/api/projects/[projectId]/tasks/[taskId]/tabs/[tabId]/document/route.ts',
    ])
  })

  it('gives the client surface no export and no import, since neither is a link holder act', () => {
    const underS = routeFiles(join(APP, 's'))
    expect(underS.some((file) => file.includes('export'))).toBe(false)
    expect(underS.some((file) => file.includes('import'))).toBe(false)
  })
})
