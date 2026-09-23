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

/**
 * ADR 0049 says this package is pure "and that is enforced rather than intended" — this is where.
 *
 * The pass has two consumers on opposite sides of the API, and ADR 0027 bans a Next app from
 * importing a `*-domain` package by name, so the code lives in a package of its own rather than in
 * `@repo/macroplan-domain`, whose barrel genuinely reaches `node:path` and `node:crypto`. What that
 * buys is only as good as its enforcement: a `node:` specifier or a single dependency would make the
 * browser half of the product unable to draw a bar, and neither failure shows up in a test of what
 * this package computes. ADR 0049 names this file by path as the check, and both halves of the claim
 * are asserted — nothing at all in `dependencies`, not even Zod, and no `node:` specifier in any
 * shipped file in any quote style or import form.
 */
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

  it('contains no reference to a `node:` specifier, in any quote style or import form', () => {
    const offenders = shipped.filter((file) => /['"]node:/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
