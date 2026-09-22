import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(SRC, '..')
const SELF = fileURLToPath(import.meta.url)

function sources(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) return sources(full)
    return entry.isFile() && full.endsWith('.ts') ? [full] : []
  })
}

const shipped = sources(SRC).filter(
  (file) => file !== SELF && !file.endsWith('.test.ts'),
)

describe('the package declares no dependencies at all', () => {
  it('has an empty or absent "dependencies" key in package.json', () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }
    expect(manifest.dependencies ?? {}).toEqual({})
  })
})

describe('shipped source never reaches a node builtin (this package is bundled for a browser)', () => {
  it('walks at least one shipped file, so the scan below is exercising something', () => {
    expect(shipped.length).toBeGreaterThan(0)
  })

  it('contains no `from \'node:` import', () => {
    const offenders = shipped.filter((file) => readFileSync(file, 'utf8').includes("from 'node:"))
    expect(offenders).toEqual([])
  })

  it('contains no `require(\'node:` call', () => {
    const offenders = shipped.filter((file) => readFileSync(file, 'utf8').includes("require('node:"))
    expect(offenders).toEqual([])
  })
})
