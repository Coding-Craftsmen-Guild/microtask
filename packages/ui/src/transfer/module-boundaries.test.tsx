import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConflictChoiceField } from '@repo/ui/transfer/conflict-choice'
import { ConflictList } from '@repo/ui/transfer/conflict-list'
import { ExportDialog } from '@repo/ui/transfer/export-dialog'
import { PreviewTable } from '@repo/ui/transfer/preview-table'
import { ResultTable } from '@repo/ui/transfer/result-table'
import { ShareLinkList } from '@repo/ui/transfer/share-link-list'
import { TransferPanel } from '@repo/ui/transfer/transfer-panel'
import { collidingProjects, remintNotice, taskCountLabel } from '@repo/ui/transfer/outcomes.js'
import { useConflictChoices } from '@repo/ui/transfer/use-conflict-choices.js'
import type { TransferGroup, TransferProjectResult } from './vocabulary'

const PACKAGE = resolve(process.cwd())
const SRC = join(PACKAGE, 'src')
const TRANSFER = join(SRC, 'transfer')
const MANIFEST = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as {
  exports: Record<string, string | null>
}

const SERVER_SAFE = [
  'outcomes.ts',
  'preview-row.tsx',
  'preview-table.tsx',
  'result-row.tsx',
  'result-table.tsx',
  'share-link-list.tsx',
  'vocabulary.ts',
]

const CLIENT_ONLY = [
  'conflict-choice.tsx',
  'conflict-list.tsx',
  'export-dialog.tsx',
  'transfer-panel.tsx',
  'use-conflict-choices.ts',
]

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
  const stem = base.endsWith('.js') ? base.slice(0, -3) : base
  for (const candidate of [`${stem}.tsx`, `${stem}.ts`]) {
    if (existsSync(candidate)) return candidate
  }
  if (existsSync(stem) && stem !== base) return stem
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

const literalTokens = (source: string) =>
  (source.replace(/\/\*[\s\S]*?\*\//g, ' ').match(/"[^"\n]*"|'[^'\n]*'/g) ?? [])
    .flatMap((literal) => literal.slice(1, -1).split(/\s+/))
    .filter((token) => token !== '')

const SCANNED_TOKENS = new Set(walk(SRC).flatMap((file) => literalTokens(read(file))))

const THEME_CSS = read(join(SRC, 'styles', 'globals.css'))

const THEME_COLOURS = new Set(
  [...THEME_CSS.matchAll(/--color-([\w-]+)\s*:/g)].map((match) => match[1] ?? ''),
)

const COLOUR_PREFIXES = new Set([
  'accent',
  'bg',
  'border',
  'caret',
  'decoration',
  'divide',
  'fill',
  'from',
  'outline',
  'ring',
  'shadow',
  'stroke',
  'text',
  'to',
  'via',
])

const NOT_A_COLOUR = new Set(['1', 'collapse', 'left', 't'])

const colourOf = (token: string) => {
  if (token.includes('[')) return ''
  const bare = token.split(':').pop() ?? ''
  const [prefix, ...rest] = bare.split('-')
  if (!COLOUR_PREFIXES.has(prefix ?? '')) return ''
  return (rest.join('-').split('/')[0] ?? '').trim()
}

const TRANSFER_CLASS_TOKENS = [
  ...new Set(walk(TRANSFER).flatMap((file) => literalTokens(read(file)))),
].filter((token) => colourOf(token) !== '')

const group = (over: Partial<TransferGroup> = {}): TransferGroup => ({
  path: 'volume/projects/01PROJECT',
  shape: 'v2-project-directory',
  projectId: '01PROJECT',
  name: 'Acme rollout',
  manifestTaskCount: 2,
  taskFilesFound: 2,
  shareLinks: [
    { index: 0, name: 'Acme', role: 'manage', scope: { kind: 'project', projectId: '01PROJECT' } },
  ],
  existsInTarget: true,
  outcome: 'importable',
  reasons: [],
  ...over,
})

const landed = (over: Partial<TransferProjectResult> = {}): TransferProjectResult => ({
  path: 'volume/projects/01PROJECT',
  projectId: '01PROJECT',
  writtenProjectId: '01PROJECT',
  choice: 'replace',
  outcome: 'replaced',
  tasksWritten: 2,
  tasksRemoved: 1,
  shareLinksReminted: 0,
  shareLinksStranded: 1,
  reasons: [],
  ...over,
})

describe('transfer module boundaries', () => {
  it('resolves every transfer module through its own declared subpath, with no barrel', () => {
    for (const exported of [
      ConflictChoiceField,
      ConflictList,
      ExportDialog,
      PreviewTable,
      ResultTable,
      ShareLinkList,
      TransferPanel,
      collidingProjects,
      remintNotice,
      taskCountLabel,
      useConflictChoices,
    ]) {
      expect(typeof exported).toBe('function')
    }
    expect(existsSync(join(TRANSFER, 'index.ts'))).toBe(false)
  })

  it('declares the pattern pair a mixed directory needs, so a .ts sibling needs no new entry', () => {
    expect(MANIFEST.exports['./transfer/*']).toBe('./src/transfer/*.tsx')
    expect(MANIFEST.exports['./transfer/*.js']).toBe('./src/transfer/*.ts')
  })

  it('publishes no test module through either half of that pair', () => {
    expect(MANIFEST.exports['./transfer/*.test']).toBeNull()
    expect(MANIFEST.exports['./transfer/*.test.js']).toBeNull()
  })

  it('accounts for every module in the directory as either client-only or server-safe', () => {
    const listed = new Set([...SERVER_SAFE, ...CLIENT_ONLY])
    const onDisk = walk(TRANSFER).map((file) => relative(TRANSFER, file).split('\\').join('/'))
    expect(onDisk.filter((file) => !listed.has(file))).toEqual([])
    expect([...listed].filter((file) => !onDisk.includes(file))).toEqual([])
  })

  it('puts the use client directive on the first line of each interactive module', () => {
    for (const name of CLIENT_ONLY) {
      expect(declaresUseClient(read(join(TRANSFER, name))), name).toBe(true)
    }
  })

  it('keeps the directive off every server-safe module, so a page can render the tables', () => {
    for (const name of SERVER_SAFE) {
      expect(declaresUseClient(read(join(TRANSFER, name))), name).toBe(false)
    }
  })

  it('reaches no client-only module from any server-safe one, transitively', () => {
    for (const name of SERVER_SAFE) {
      for (const reached of reachableFrom(join(TRANSFER, name))) {
        expect(
          declaresUseClient(read(reached)),
          `${name} reaches the client module ${relative(SRC, reached)}`,
        ).toBe(false)
      }
    }
  })

  it('does reach client modules from the panel, which is what makes the check meaningful', () => {
    const reached = reachableFrom(join(TRANSFER, 'transfer-panel.tsx'))
    expect(reached.filter((file) => declaresUseClient(read(file))).length).toBeGreaterThan(0)
  })

  it('composes no class name by interpolation or concatenation anywhere in the subtree', () => {
    for (const file of walk(TRANSFER)) {
      const source = read(file)
      expect(source, relative(SRC, file)).not.toMatch(/className=\{`/)
      expect(source, relative(SRC, file)).not.toMatch(/className="[^"]*\$\{/)
      expect(source, relative(SRC, file)).not.toMatch(/className=\{[^}]*\+\s*['"`]/)
    }
  })

  it('renders only class names the Tailwind scanner can find verbatim under a scan root', () => {
    const noop = vi.fn()
    const groups = [
      group(),
      group({ path: 'b', outcome: 'blocked', reasons: ['refused'] }),
      group({ path: 'c', outcome: 'error', manifestTaskCount: null, reasons: ['unreadable'] }),
    ]
    const results = [
      landed(),
      landed({ path: 'b', outcome: 'skipped' }),
      landed({ path: 'c', outcome: 'failed', reasons: ['ENOSPC'] }),
    ]
    const trees = [
      <PreviewTable groups={groups} key="p" />,
      <ResultTable key="r" results={results} />,
      <ShareLinkList key="s" links={[]} />,
      <ConflictChoiceField
        key="c"
        name="Acme"
        onChange={noop}
        projectId="01P"
        shareLinks={3}
        value="new"
      />,
      <ExportDialog
        key="e"
        onCancel={noop}
        onExport={noop}
        onPreserveTokensChange={noop}
        open
        preserveTokens
      />,
      <TransferPanel
        files={[]}
        key="t"
        onConfirm={noop}
        preview={{ sessionId: '01S', groups }}
        result={null}
      />,
    ]
    expect(SCANNED_TOKENS.has('bg-not-a-real-utility')).toBe(false)
    expect(SCANNED_TOKENS.has('text-ok-ligh')).toBe(false)
    for (const tree of trees) {
      render(tree)
      const nodes = document.body.querySelectorAll<HTMLElement>('[class]')
      expect(nodes.length).toBeGreaterThan(0)
      for (const node of nodes) {
        for (const token of node.className.split(/\s+/).filter(Boolean)) {
          expect(
            SCANNED_TOKENS.has(token),
            `class "${token}" is not a whole literal under any scan root`,
          ).toBe(true)
        }
      }
      cleanup()
    }
  })

  it('names only theme colours globals.css declares, so a renamed token cannot go unpainted', () => {
    const unknown = TRANSFER_CLASS_TOKENS.filter((token) => {
      const colour = colourOf(token)
      return !THEME_COLOURS.has(colour) && !NOT_A_COLOUR.has(colour)
    })
    expect(unknown).toEqual([])
    expect(THEME_COLOURS.size).toBeGreaterThan(20)
  })

  it('keeps that allowlist honest: nothing in it is a colour, and nothing in it is unused', () => {
    const used = new Set(TRANSFER_CLASS_TOKENS.map((token) => colourOf(token)))
    for (const entry of NOT_A_COLOUR) {
      expect(THEME_COLOURS.has(entry), `${entry} is a declared colour`).toBe(false)
      expect(used.has(entry), `${entry} is allowlisted but never used`).toBe(true)
    }
  })

  it('reads a real set of colour-carrying classes, so the two checks above are not empty', () => {
    expect(TRANSFER_CLASS_TOKENS.length).toBeGreaterThan(15)
    expect(TRANSFER_CLASS_TOKENS).toContain('bg-brand-soft')
  })
})
