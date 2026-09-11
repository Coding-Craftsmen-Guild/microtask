import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const PATTERNS = readFileSync(new URL('../../../../.dockerignore', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))

describe('.dockerignore', () => {
  it.each([
    ['data', 'production data never enters a build context'],
    ['**/.env', 'the .env beside the compose file is where a deployment keeps its secrets'],
    ['**/.env.*', 'next build copies a loaded .env.production into the standalone image'],
    ['.git', 'history is not an input to any image'],
    ['**/node_modules', 'a host install for another platform must not shadow the in-image one'],
    ['**/*.test.ts', 'tests are not an input to any image'],
    ['**/*.test.tsx', 'tests are not an input to any image'],
  ])('excludes %s: %s', (pattern) => {
    expect(PATTERNS).toContain(pattern)
  })

  it('re-includes nothing, so no later line can undo an exclusion above', () => {
    expect(PATTERNS.filter((line) => line.startsWith('!'))).toEqual([])
  })
})
