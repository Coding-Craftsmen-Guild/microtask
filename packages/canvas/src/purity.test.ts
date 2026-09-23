import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(SRC, '..')

function sources(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) return sources(full)
    return entry.isFile() && full.endsWith('.ts') ? [full] : []
  })
}

const shipped = sources(SRC).filter((file) => !file.endsWith('.test.ts'))

describe('the package declares no runtime dependency beyond @repo/schedule, whose rail order it calls rather than re-derive', () => {
  it('has exactly {"@repo/schedule": "workspace:*"} in "dependencies", and nothing else', () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }
    expect(manifest.dependencies ?? {}).toEqual({ '@repo/schedule': 'workspace:*' })
  })
})

describe('shipped source never reaches a node builtin, because an app imports this package and a node: specifier here is a browser bundle that will not build', () => {
  it('walks at least one shipped file, so the scan below is exercising something', () => {
    expect(shipped.length).toBeGreaterThan(0)
  })

  it('contains no reference to a `node:` specifier, in any quote style or import form', () => {
    const offenders = shipped.filter((file) => /['"]node:/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
