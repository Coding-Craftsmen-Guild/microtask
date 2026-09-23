import { readFileSync, readdirSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import LinkSurfaceLayout, { metadata } from './layout'

const APP = resolve(process.cwd())

// The two roots the seat surface is made of. `components/plan/module-boundaries.test.tsx` sweeps
// `components/plan/**` alone — its scan of every app file builds the *vocabulary* of literal class
// names, not the set it asserts over — so neither of these is covered by it, and the sweeps below are
// the only ones that reach them.
const ROOTS = [join(APP, 'app', 's'), join(APP, 'components', 'link')]

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = join(dir, entry.name)
    return entry.isDirectory() ? walk(next) : /\.tsx?$/.test(entry.name) ? [next] : []
  })

const FILES = ROOTS.flatMap(walk)

// A Suspense boundary over `/s/[token]` can be declared by any segment **above** it too, and the
// segments above it are exactly two: the app root and `app/s`. So the sweep reads the root's own
// files as well — not the whole of `app/**`, because the admin surface is allowed one and ADR 0040
// records that it keeps its boundaries and answers its own redirects with a 200 in consequence.
const ROOT_FILES = readdirSync(join(APP, 'app'), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(APP, 'app', entry.name))

const ABOVE_AND_UNDER = [...ROOT_FILES, ...FILES]

const SHIPPED = FILES.filter((file) => !file.includes('.test.'))

const isLoading = (file: string): boolean => /^loading\.tsx?$/.test(basename(file))

const declaresUseClient = (file: string): boolean => {
  const first = readFileSync(file, 'utf8').split(/\r?\n/).find((line) => line.trim() !== '') ?? ''
  return /^["']use client["'];?$/.test(first.trim())
}

const named = (file: string): string => relative(APP, file).split('\\').join('/')

describe('the /s/* subtree', () => {
  it('is noindex and nofollow, for every page under it rather than one', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('asks for no referrer, so a page that links out does not send its token-bearing URL', () => {
    expect(metadata.referrer).toBe('no-referrer')
  })

  it('passes its page through untouched, holding no frame of its own', () => {
    const children = <p>page</p>
    expect(LinkSurfaceLayout({ children })).toBe(children)
  })
})

describe('the surface this sweep reads', () => {
  it('walks a real set of files, so the sweeps below are not empty', () => {
    expect(SHIPPED.length).toBeGreaterThan(5)
    expect(SHIPPED.map(named)).toContain('app/s/[token]/page.tsx')
    expect(SHIPPED.map(named)).toContain('components/link/link-frame.tsx')
  })

  it('would recognise the file it is looking for, by the name Next gives it', () => {
    expect(isLoading('app/s/[token]/loading.tsx')).toBe(true)
    expect(isLoading('app/s/loading.ts')).toBe(true)
    expect(isLoading('app/s/[token]/page.tsx')).toBe(false)
  })
})

describe('and has no loading.tsx over it, its own or an ancestor’s, which is a measured requirement', () => {
  it('leaves a dead link a 307 and a missing plan a 404, rather than a 200 with a meta refresh', () => {
    expect(ABOVE_AND_UNDER.filter(isLoading).map(named)).toEqual([])
  })

  it('reads the app root as well as the subtree, so an app/loading.tsx could not hide from it', () => {
    expect(ROOT_FILES.map(named)).toContain('app/layout.tsx')
  })
})

describe('what renders on the server, and what does not', () => {
  it('declares use client in error.tsx and nowhere else on the surface', () => {
    const client = SHIPPED.filter(declaresUseClient).map(named)
    expect(client).toEqual(['app/s/[token]/error.tsx'])
  })

  it('composes no class name by interpolation or concatenation anywhere under it', () => {
    for (const file of SHIPPED) {
      const source = readFileSync(file, 'utf8')
      expect(source, named(file)).not.toMatch(/className=\{`/)
      expect(source, named(file)).not.toMatch(/className="[^"]*\$\{/)
      expect(source, named(file)).not.toMatch(/className=\{[^}]*\+\s*['"`]/)
    }
  })
})
