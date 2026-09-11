import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as api from './index.js'

const SRC = dirname(fileURLToPath(import.meta.url))

function sources(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) return sources(full)
    return entry.isFile() && full.endsWith('.ts') ? [full] : []
  })
}

const SELF = fileURLToPath(import.meta.url)

const files = sources(SRC).filter((file) => file !== SELF)

const code = (file: string): string => readFileSync(file, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '')

const offenders = (pattern: RegExp, only?: (file: string) => boolean): readonly string[] =>
  files.filter((file) => (only?.(file) ?? true) && pattern.test(code(file)))

describe('the package reads no environment variable anywhere (ADR 0012)', () => {
  it('walks every source file but this one, which has to name the pattern it hunts for', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files).not.toContain(SELF)
  })

  it('contains no process.env outside a comment, in shipped source or in a test', () => {
    expect(files.filter((file) => code(file).includes('process.env'))).toEqual([])
  })

  it('contains no reference to process at all, so nothing can grow one', () => {
    expect(offenders(/\bprocess\b/u)).toEqual([])
  })
})

describe('the barrel is the whole public surface', () => {
  it('has no default export, so a caller must name what it imports', () => {
    expect(Object.keys(api)).not.toContain('default')
  })

  it('exports the two constructors and the login that mints a token for one of them', () => {
    expect(Object.keys(api)).toContain('createAdminClient')
    expect(Object.keys(api)).toContain('createLinkClient')
    expect(Object.keys(api)).toContain('login')
  })
})

describe('shipped source carries no type suppression', () => {
  const shipped = (file: string): boolean => !file.endsWith('.test.ts')

  it('has no ts-expect-error or ts-ignore outside the tests', () => {
    expect(offenders(/@ts-(expect-error|ignore)/u, shipped)).toEqual([])
  })

  it('has no cast and no any outside the tests', () => {
    expect(offenders(/\bas\s+(?:const\b|unknown\b|any\b|[A-Z])/u, shipped)).toEqual([])
    expect(offenders(/:\s*any\b/u, shipped)).toEqual([])
  })

  it('places the one deliberate type error in a test, which is what a test is for', () => {
    expect(offenders(/@ts-expect-error/u, (file) => file.endsWith('clients.test.ts'))).toHaveLength(1)
  })
})
