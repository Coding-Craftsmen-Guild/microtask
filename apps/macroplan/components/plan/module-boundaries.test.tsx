import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Plan } from '@repo/api-client'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ADMIN_CONTROLS } from '../../lib/admin-controls'
import { PlanCanvas } from './canvas/plan-canvas'
import { PlanScreen } from './plan-screen'
import { planScreenModel } from './plan-screen-model'
import type { TableRow } from './table/rows'
import { PlanTable } from './table/plan-table'
import { atlasPlan, FEATURE_1, unplacedPlan } from './testing/plan-fixture'

vi.mock('next/link', async () => ({
  default: (await import('./testing/next-link')).LinkDouble,
}))

const { DrawerPanel } = await import('./drawer/drawer-panel')

// Ported from packages/ui/src/transfer/module-boundaries.test.tsx, because neither app had an
// equivalent and a canvas is exactly where a composed class name is tempting. Tailwind's scanner
// reads source as plain text: a class name it cannot see as a whole literal is a class name it emits
// no CSS for, and the element renders unstyled with nothing failing anywhere. The two roots below are
// the ones packages/ui/src/styles/globals.css declares with @source for this app — minus test files,
// which Tailwind does scan and this deliberately does not: a production class whose only literal is in
// a test is one a deleted test would silently unpaint, so this sweep is stricter than the scanner.
// That exclusion is the check, not a bug in it: widening it to match the scanner trades the guard away.

const APP = resolve(process.cwd())

const PLAN = join(APP, 'components', 'plan')

const UI_SRC = resolve(APP, '..', '..', 'packages', 'ui', 'src')

const AT = new Date('2026-10-05T09:00:00.000Z')

const read = (file: string) => readFileSync(file, 'utf8')

const SKIP = new Set(['node_modules', '.next', '.turbo', 'public'])

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const next = join(dir, entry.name)
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : walk(next)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [next] : []
  })

const literalTokens = (source: string): readonly string[] =>
  (source.replace(/\/\*[\s\S]*?\*\//g, ' ').match(/"[^"\n]*"|'[^'\n]*'/g) ?? [])
    .flatMap((literal) => literal.slice(1, -1).split(/\s+/))
    .filter((token) => token !== '')

const SCANNED_TOKENS = new Set(
  [...walk(APP), ...walk(UI_SRC)].flatMap((file) => literalTokens(read(file))),
)

const declaresUseClient = (source: string) => {
  const first = source.split(/\r?\n/).find((line) => line.trim() !== '') ?? ''
  return /^["']use client["'];?$/.test(first.trim())
}

const unclaimed = (): Plan => ({ ...atlasPlan(), epics: [] })

// Every `plan` prop under this subtree is `PlanScreenModel`, whose type cannot hold a share token,
// and every fixture here is a `StoredPlan` that carries three. So each tree is handed its plan
// through the same reducer both surfaces' reads use — which is stricter than a cast would be, since
// it renders the object a page really hands over. `PlanCanvas` and `PlanTable` are wrapped too now:
// the narrowing is their own floor rather than a ceiling on `PlanScreen` one level up, because this
// phase mounts surfaces beside that screen where a ceiling above it reaches nothing.
//
// `ADMIN_CONTROLS` is what the admin page passes, and it draws every control there is — so a tree
// rendered with it paints whatever markup a control brings with it, which is the stricter of the two
// answers for a sweep of class names.
//
// The last two trees are the drawer: once in the slot the plan layout fills from its own `children`,
// and once on its own, because a panel routed into that slot is painted by this sweep only if
// something here renders it. `next/link` is doubled for them — `DrawerPanel` closes with a `Link`,
// and the double forwards `className`, which is the attribute this file reads.
// One row, written out rather than looked up, so the drawer tree below paints a panel whatever the
// derived order does with the fixture.
const DRAWER_ROW: TableRow = {
  id: FEATURE_1,
  kind: 'feature',
  epic: 'Platform',
  feature: 'Auth rewrite',
  item: null,
  estimate: '5d',
  sprint: 'S1',
  treatment: 'solid',
  blockedBy: [],
}

const TREES = [
  <PlanScreen
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    key="a"
    plan={planScreenModel(atlasPlan())}
  />,
  <PlanScreen
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    key="b"
    plan={planScreenModel(unplacedPlan('no-estimate'))}
  />,
  <PlanScreen
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    key="c"
    plan={planScreenModel(unplacedPlan('in-cycle'))}
  />,
  <PlanScreen
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={null}
    key="d"
    plan={planScreenModel(unclaimed())}
  />,
  <PlanCanvas
    at={AT}
    key="e"
    plan={planScreenModel(atlasPlan())}
    range={{ fromDay: 0, toDay: 61 }}
  />,
  <PlanTable key="f" plan={planScreenModel(unplacedPlan('in-cycle'))} />,
  <PlanScreen
    at={AT}
    controls={ADMIN_CONTROLS}
    drawer={<DrawerPanel closeHref="/plans/atlas" row={DRAWER_ROW} />}
    key="g"
    plan={planScreenModel(atlasPlan())}
  />,
  <DrawerPanel closeHref="/plans/atlas" key="h" row={{ ...DRAWER_ROW, kind: 'item', item: 'Sessions', treatment: 'hollow' }} />,
]

describe('the class-literal reader this sweep is built on', () => {
  it('reads a real set of files and a real set of tokens, so the sweep below is not empty', () => {
    expect(walk(PLAN).length).toBeGreaterThan(10)
    expect(SCANNED_TOKENS.size).toBeGreaterThan(200)
    expect(SCANNED_TOKENS.has('overflow-x-auto')).toBe(true)
  })

  it('reads no token out of a composed class name, which is the failure Tailwind makes silent', () => {
    const composed = 'const T = "bg-"\nexport const X = () => <div className={`${T}card`} />'
    expect(literalTokens(composed)).not.toContain('bg-card')
    expect(/className=\{`/.test(composed)).toBe(true)
  })

  it('knows a name no source holds, so “found under a scan root” means something', () => {
    expect(SCANNED_TOKENS.has('bg-not-a-real-utility')).toBe(false)
    expect(SCANNED_TOKENS.has('peer-checked/tabl:not-a-real-utility')).toBe(false)
  })
})

describe('the plan subtree', () => {
  it('composes no class name by interpolation or concatenation anywhere under it', () => {
    for (const file of walk(PLAN)) {
      const source = read(file)
      expect(source, relative(APP, file)).not.toMatch(/className=\{`/)
      expect(source, relative(APP, file)).not.toMatch(/className="[^"]*\$\{/)
      expect(source, relative(APP, file)).not.toMatch(/className=\{[^}]*\+\s*['"`]/)
    }
  })

  it('declares no use client anywhere, so the whole plan renders on the server', () => {
    for (const file of walk(PLAN)) {
      expect(declaresUseClient(read(file)), relative(APP, file)).toBe(false)
    }
  })

  it('renders only class names the Tailwind scanner can find verbatim under a scan root', () => {
    for (const tree of TREES) {
      render(tree)
      const nodes = document.querySelectorAll('[class]')
      expect(nodes.length).toBeGreaterThan(0)
      for (const node of nodes) {
        for (const token of (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
          expect(
            SCANNED_TOKENS.has(token),
            `class "${token}" is not a whole literal under any scan root`,
          ).toBe(true)
        }
      }
      cleanup()
    }
  })
})
