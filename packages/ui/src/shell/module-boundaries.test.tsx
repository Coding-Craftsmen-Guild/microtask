import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppBar } from '@repo/ui/shell/app-bar'
import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { EmptyState } from '@repo/ui/shell/empty-state'
import { Page } from '@repo/ui/shell/page'
import { ProgressBar } from '@repo/ui/shell/progress-bar'
import { PromptDialog } from '@repo/ui/shell/prompt-dialog'
import { RelativeTime } from '@repo/ui/shell/relative-time'
import { relativeTime } from '@repo/ui/lib/time'

const SRC = resolve(process.cwd(), 'src')

const SERVER_SAFE = ['app-bar', 'empty-state', 'page', 'progress-bar', 'relative-time']
const CLIENT_ONLY = ['confirm-dialog', 'prompt-dialog']

const read = (file: string) => readFileSync(file, 'utf8')

const declaresUseClient = (source: string) => {
  const first = source.split(/\r?\n/).find((line) => line.trim() !== '') ?? ''
  return /^["']use client["'];?$/.test(first.trim())
}

const specifiersOf = (source: string) => [
  ...[...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((match) => match[1] ?? ''),
  ...[...source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((match) => match[1] ?? ''),
]

const resolveLocal = (fromFile: string, specifier: string) => {
  let base = ''
  if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else if (specifier.startsWith('@repo/ui/')) base = join(SRC, specifier.slice(9))
  else return ''
  for (const extension of ['.tsx', '.ts', '']) {
    if (extension !== '' || existsSync(base)) {
      if (existsSync(base + extension)) return base + extension
    }
  }
  throw new Error(`${relative(SRC, fromFile)} imports ${specifier}, which resolves to no file`)
}

const reachableFrom = (entry: string) => {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() ?? ''
    if (seen.has(file)) continue
    seen.add(file)
    for (const specifier of specifiersOf(read(file))) {
      const target = resolveLocal(file, specifier)
      if (target !== '' && !seen.has(target)) queue.push(target)
    }
  }
  seen.delete(entry)
  return [...seen]
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = join(dir, entry.name)
    if (entry.isDirectory()) return walk(next)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [next] : []
  })

const SCANNED_SOURCE = walk(SRC)
  .map((file) => read(file))
  .join('\n')

describe('shell module boundaries', () => {
  it('resolves every shell component through its own declared subpath, with no barrel', () => {
    for (const exported of [
      AppBar,
      ConfirmDialog,
      EmptyState,
      Page,
      ProgressBar,
      PromptDialog,
      RelativeTime,
      relativeTime,
    ]) {
      expect(typeof exported).toBe('function')
    }
    expect(existsSync(join(SRC, 'index.ts'))).toBe(false)
    expect(existsSync(join(SRC, 'shell', 'index.ts'))).toBe(false)
  })

  it('puts the use client directive on the first line of each interactive component', () => {
    for (const name of CLIENT_ONLY) {
      expect(declaresUseClient(read(join(SRC, 'shell', `${name}.tsx`))), name).toBe(true)
    }
  })

  it('keeps the directive off every server-safe component, so a page can render it', () => {
    for (const name of SERVER_SAFE) {
      expect(declaresUseClient(read(join(SRC, 'shell', `${name}.tsx`))), name).toBe(false)
    }
  })

  it('reaches no client-only module from any server-safe one, transitively', () => {
    for (const name of SERVER_SAFE) {
      const entry = join(SRC, 'shell', `${name}.tsx`)
      for (const reached of reachableFrom(entry)) {
        expect(
          declaresUseClient(read(reached)),
          `${name} reaches the client module ${relative(SRC, reached)}`,
        ).toBe(false)
      }
    }
  })

  it('does reach client modules from the dialogs, which is what makes the check meaningful', () => {
    const reached = CLIENT_ONLY.flatMap((name) => reachableFrom(join(SRC, 'shell', `${name}.tsx`)))
    expect(reached.filter((file) => declaresUseClient(read(file))).length).toBeGreaterThan(0)
  })

  it('composes no class name by interpolation or concatenation anywhere in the shell', () => {
    for (const file of walk(join(SRC, 'shell'))) {
      const source = read(file)
      expect(source, relative(SRC, file)).not.toMatch(/className=\{`/)
      expect(source, relative(SRC, file)).not.toMatch(/className="[^"]*\$\{/)
      expect(source, relative(SRC, file)).not.toMatch(/className=\{[^}]*\+\s*['"`]/)
    }
  })

  it('renders only class names the Tailwind scanner can find verbatim under a scan root', () => {
    const noop = vi.fn()
    const trees = [
      <AppBar key="a" product="Microtask" />,
      <ConfirmDialog danger key="c" message="m" onCancel={noop} onConfirm={noop} open title="t" />,
      <EmptyState key="e">No projects yet</EmptyState>,
      <Page key="p">body</Page>,
      <ProgressBar done={4} key="g" total={4} />,
      <ProgressBar done={0} key="h" total={0} />,
      <PromptDialog key="r" label="Tab name" onCancel={noop} onSubmit={noop} open title="t" />,
      <RelativeTime from="2026-09-11T09:00:00.000Z" key="t" now={Date.parse('2026-09-11T12:00:00Z')} />,
    ]
    expect(SCANNED_SOURCE).not.toContain('bg-not-a-real-utility')
    for (const tree of trees) {
      render(<Page>{tree}</Page>)
      const nodes = document.body.querySelectorAll<HTMLElement>('[class]')
      expect(nodes.length).toBeGreaterThan(0)
      for (const node of nodes) {
        for (const token of node.className.split(/\s+/).filter(Boolean)) {
          expect(SCANNED_SOURCE, `class "${token}" is not a literal under any scan root`).toContain(
            token,
          )
        }
      }
      cleanup()
    }
  })
})
