import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Manifest {
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
}

const read = (at: string): Manifest =>
  JSON.parse(readFileSync(new URL(at, import.meta.url), 'utf8')) as Manifest

const MANIFEST = read('../../package.json')
const READER = '@zip.js/zip.js'
const PINNED = ['hono', '@hono/node-server', '@hono/zod-openapi']
const EXACT = /^\d+\.\d+\.\d+$/

const runtime = (): Record<string, string> => MANIFEST.dependencies ?? {}
const development = (): Record<string, string> => MANIFEST.devDependencies ?? {}

const source = (at: string): string => readFileSync(new URL(at, import.meta.url), 'utf8')

describe('the zip reader ships in the image, which `pnpm deploy --prod` decides by section', () => {
  it('declares it under dependencies, the only section the deployed tree keeps', () => {
    expect(Object.keys(runtime())).toContain(READER)
  })

  it('keeps it out of devDependencies, where the deploy would drop it', () => {
    expect(Object.keys(development())).not.toContain(READER)
  })

  it('pins it inline at an exact version, the way hono and the two @hono packages are pinned', () => {
    expect(runtime()[READER]).toMatch(EXACT)
    for (const name of PINNED) expect([name, runtime()[name]]).toEqual([name, expect.stringMatching(EXACT)])
  })

  it('pins it here rather than through the catalog, which carries what several packages share', () => {
    expect(runtime()[READER]).not.toBe('catalog:')
    expect(runtime()['zod']).toBe('catalog:')
  })

  it('installs the version it pins, for this package rather than by hoisting', () => {
    const installed = JSON.parse(
      readFileSync(new URL(`../../node_modules/${READER}/package.json`, import.meta.url), 'utf8'),
    ) as { version?: string }
    expect(installed.version).toBe(runtime()[READER])
  })

  it('is imported by the expander under exactly that specifier, so the entry is not stale', () => {
    expect(source('../routes/microtask/import/archive.ts')).toContain(`from '${READER}'`)
  })

  it('reaches it through no deep path, which the import ban would not otherwise catch', () => {
    const deep = new RegExp(`from '${READER}/`)
    expect(deep.test(source('../routes/microtask/import/archive.ts'))).toBe(false)
  })

  it('brings no transitive dependency with it, which is why this one and not another reader', () => {
    const installed = read(`../../node_modules/${READER}/package.json`)
    expect(installed.dependencies ?? {}).toEqual({})
  })
})
