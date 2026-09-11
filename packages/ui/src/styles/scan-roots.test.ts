import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE = resolve(process.cwd())
const STYLESHEET = resolve(PACKAGE, 'src/styles/globals.css')
const CSS = readFileSync(STYLESHEET, 'utf8')

const posix = (path: string) => path.replace(/\\/g, '/')

const SCAN_ROOTS = [...CSS.matchAll(/@source\s+"([^"]+)"/g)].map((match) =>
  posix(resolve(PACKAGE, 'src/styles', match[1] ?? '')),
)

const toRegExp = (glob: string) => {
  const body = glob
    .replace(/[.+^$()|[\]]/g, '\\$&')
    .replace(/\{([^}]+)\}/g, (_match, list: string) => `(?:${list.split(',').join('|')})`)
    .split('**/')
    .map((part) => part.replace(/\*/g, '[^/]*'))
    .join('(?:.*/)?')
  return new RegExp(`^${body}$`, 'i')
}

const keyframeBody = (name: string) => {
  const open = CSS.indexOf('{', CSS.indexOf(`@keyframes ${name}`))
  expect(open).toBeGreaterThan(0)
  let depth = 0
  for (let index = open; index < CSS.length; index += 1) {
    if (CSS[index] === '{') depth += 1
    if (CSS[index] === '}') depth -= 1
    if (depth === 0) return CSS.slice(open + 1, index)
  }
  throw new Error(`@keyframes ${name} is never closed`)
}

const scanned = (path: string) =>
  SCAN_ROOTS.some((root) => toRegExp(root).test(posix(resolve(PACKAGE, path))))

describe('globals.css scan roots', () => {
  it('declares exactly the two roots ADR 0025 settled on, with the four-../ app arithmetic', () => {
    expect(SCAN_ROOTS).toEqual([
      posix(resolve(PACKAGE, 'src')) + '/**/*.{ts,tsx}',
      posix(resolve(PACKAGE, '../../apps/microtask')) + '/**/*.{ts,tsx}',
    ])
  })

  it('already covers src/shell and src/lib, so hand-written shared code needs no new @source', () => {
    expect(scanned('src/shell/progress-bar.tsx')).toBe(true)
    expect(scanned('src/shell/confirm-dialog.tsx')).toBe(true)
    expect(scanned('src/lib/time.ts')).toBe(true)
    expect(scanned('src/components/dialog.tsx')).toBe(true)
  })

  it('does not cover a sibling package or a non-source file, so the matcher discriminates', () => {
    expect(scanned('../contracts/src/limits.ts')).toBe(false)
    expect(scanned('src/styles/globals.css')).toBe(false)
    expect(scanned('../../apps/api/src/server.ts')).toBe(false)
  })

  it('switches automatic detection off, so an unlisted directory is invisible on purpose', () => {
    expect(CSS).toContain('@import "tailwindcss" source(none);')
  })
})

describe('globals.css progress theme', () => {
  it('carries legacy’s exact gold and green gradient stops as shared theme tokens', () => {
    expect(CSS).toContain('--color-gold: #ffd24a;')
    expect(CSS).toContain('--color-gold-deep: #e0ac00;')
    expect(CSS).toContain('--color-ok-light: #43c58c;')
    expect(CSS).toContain('--color-ok: #1f9d6b;')
  })

  it('carries the indigo brand ground the app bar paints with', () => {
    expect(CSS).toContain('--color-brand: #2e2456;')
  })

  it('names the fill animation at legacy’s 0.25s ease', () => {
    expect(CSS).toContain('--animate-progress-fill: progress-fill 0.25s ease;')
  })

  it('starts the keyframe at width 0 and declares no end, so the inline width is the target', () => {
    expect(keyframeBody('progress-fill')).toMatch(/from\s*\{[^}]*width:\s*0/)
  })

  it('declares no end state at all, because an explicit one would fill every bar to 100%', () => {
    const body = keyframeBody('progress-fill')
    expect(body).not.toMatch(/\bto\s*\{/)
    expect(body).not.toMatch(/\b100%\s*\{/)
    expect(body.match(/\{/g)?.length).toBe(1)
  })
})
