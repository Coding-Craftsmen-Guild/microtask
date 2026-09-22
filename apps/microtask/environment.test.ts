import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))

const SKIP = new Set(['node_modules', '.next', '.turbo', 'public'])

const sources = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const next = join(directory, entry.name)
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sources(next)
    return /\.tsx?$/.test(entry.name) ? [next] : []
  })

const named = (file: string): string => relative(ROOT, file).split(sep).join('/')

const stripped = (file: string): string => readFileSync(file, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '')

const shipped = sources(ROOT).filter((file) => !/\.(test|config)\./.test(named(file)))

describe('no file in this app reads the environment', () => {
  it('walks a real set of shipped sources, so the sweep below is not empty', () => {
    expect(shipped.length).toBeGreaterThan(100)
    expect(shipped.map(named)).toContain('instrumentation.ts')
  })

  it('finds process.env nowhere outside a test or a config', () => {
    expect(shipped.filter((file) => stripped(file).includes('process.env')).map(named)).toEqual([])
  })

  it('lifts n/no-process-env nowhere, because the one reader is @repo/app-session', () => {
    const config = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8')
    expect(config).not.toContain("'n/no-process-env': 'off'")
  })
})

describe('what the Edge instrumentation bundle pulls in', () => {
  const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

  const specifiers = (text: string): string[] =>
    [...text.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '')

  it('imports no Node built-in from instrumentation.ts, which next build compiles for Edge too', () => {
    const text = readFileSync(join(ROOT, 'instrumentation.ts'), 'utf8')
    expect(specifiers(text).filter((specifier) => NODE_BUILTINS.has(specifier))).toEqual([])
    expect(text).not.toMatch(/\bBuffer\s*\./)
  })
})
