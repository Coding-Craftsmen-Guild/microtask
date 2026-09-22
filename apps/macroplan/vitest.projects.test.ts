import { readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import config from './vitest.config'

const ROOT = dirname(fileURLToPath(import.meta.url))

const SKIP = new Set(['node_modules', '.next', '.turbo', 'public'])

interface Project {
  readonly test?: { readonly name?: string; readonly include?: readonly string[] }
}

const PROJECTS = (config.test?.projects ?? []) as readonly Project[]

const LANES = PROJECTS.map((project) => ({
  name: project.test?.name ?? '(unnamed)',
  patterns: project.test?.include ?? [],
}))

const HOLE = '\u0000'

const asRegExp = (glob: string): RegExp => {
  const source = glob
    .split('**/')
    .join(HOLE)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .split('*')
    .join('[^/]*')
    .split(HOLE)
    .join('(?:.*/)?')
  return new RegExp(`^${source}$`)
}

const lanesFor = (file: string): readonly string[] =>
  LANES.filter((lane) => lane.patterns.some((glob) => asRegExp(glob).test(file))).map(
    (lane) => lane.name,
  )

const testFiles = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const next = join(directory, entry.name)
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : testFiles(next)
    return /\.test\.tsx?$/.test(entry.name) ? [relative(ROOT, next).split('\\').join('/')] : []
  })

const ON_DISK = testFiles(ROOT)

describe('the glob-to-regexp reader this guard is built on', () => {
  it('reads a real set of projects, each with real patterns', () => {
    expect(LANES.length).toBeGreaterThan(1)
    for (const lane of LANES) expect(lane.patterns.length).toBeGreaterThan(0)
  })

  it.each([
    ['**/*.test.ts', 'a/b/c.test.ts', true],
    ['**/*.test.ts', 'c.test.ts', true],
    ['**/*.test.ts', 'a/b/c.test.tsx', false],
    ['lib/**/*.test.ts', 'lib/a/b.test.ts', true],
    ['lib/**/*.test.ts', 'actions/a.test.ts', false],
    ['*.test.ts', 'root.test.ts', true],
    ['*.test.ts', 'lib/nested.test.ts', false],
  ])('matches %s against %s as %s', (glob, file, expected) => {
    expect(asRegExp(glob).test(file)).toBe(expected)
  })
})

describe('every test file this app holds is claimed by exactly one project', () => {
  it('walks a real set of test files, so the sweep below is not empty', () => {
    expect(ON_DISK.length).toBeGreaterThan(10)
    expect(ON_DISK).toContain('environment.test.ts')
    expect(ON_DISK).toContain('app/login/login-form.test.tsx')
  })

  it('leaves none of them unclaimed, which is a file that silently never runs', () => {
    const orphans = ON_DISK.filter((file) => lanesFor(file).length === 0)
    expect(orphans).toEqual([])
  })

  it('claims none of them twice, which would run one file in two environments', () => {
    const doubled = ON_DISK.filter((file) => lanesFor(file).length > 1)
    expect(doubled).toEqual([])
  })
})

/**
 * The shapes, rather than the files, because the files are what keeps changing.
 *
 * A sweep of what is on disk can only ever pass for a config whose holes nothing has fallen into
 * yet — which is exactly the state apps/microtask was in, with three of them open. Each case below is a
 * path no file uses here yet, and each one matched **no** project under the directory-named
 * includes this app deliberately does not have: a component test with no JSX in it, an action
 * test that renders, and a test at the app root that renders. Each would have run zero
 * assertions and reported nothing.
 */
describe('and so is every shape a test file in this app can take', () => {
  it.each([
    ['a component test with no JSX', 'components/shared/thing.test.ts'],
    ['a component test that renders', 'components/shared/thing.test.tsx'],
    ['an action test', 'actions/auth.test.ts'],
    ['an action test that renders', 'actions/auth.test.tsx'],
    ['a lib test', 'lib/principal.test.ts'],
    ['a lib test that renders', 'lib/problem.test.tsx'],
    ['a route handler test', 'app/favicon.ico/route.test.ts'],
    ['a page test', 'app/(admin)/page.test.tsx'],
    ['a test at the app root', 'proxy.test.ts'],
    ['a test at the app root that renders', 'boundaries.test.tsx'],
    ['a test in a directory this app does not have yet', 'hooks/use-thing.test.ts'],
    ['one of those that renders', 'hooks/use-thing.test.tsx'],
  ])('runs %s', (_name, file) => {
    expect(lanesFor(file)).toHaveLength(1)
  })

  it('sends every .ts test to node and every .tsx test to the DOM, which is the whole rule', () => {
    for (const file of ON_DISK) {
      expect(lanesFor(file), file).toEqual([file.endsWith('.tsx') ? 'dom' : 'node'])
    }
  })
})
