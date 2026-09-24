import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Plan } from '@repo/api-client'
import { cleanup, render } from '@testing-library/react'
import { isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ADMIN_CONTROLS } from '../../lib/admin-controls'
import type { PlanEditActions } from './edit-actions'
import type { DrawerValues } from './drawer/field'
import { PlanCanvas } from './canvas/plan-canvas'
import { PlanScreen } from './plan-screen'
import { planScreenModel } from './plan-screen-model'
import type { TableRow } from './table/rows'
import { PlanTable } from './table/plan-table'
import { atlasPlan, FEATURE_1, ITEM_1, PLAN_A, unplacedPlan } from './testing/plan-fixture'
import { DescriptionField } from './drawer/description-field'
import { EstimateField } from './drawer/estimate-field'
import { NameField } from './drawer/name-field'
import { drawerSubject } from './drawer/subject'

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

const SERVED = { ok: true as const, value: atlasPlan() }

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

// The drawer now draws fields, so every tree below that mounts it hands over the pair a page hands
// over — the row the table worded and the values a field edits — plus the controls and the writes. The
// actions are stubs rather than `ADMIN_PLAN_ACTIONS`: what this file reads is class names and props,
// and a real Server Action would drag `next/headers` into a sweep that has no request. `ADMIN_CONTROLS`
// draws every field there is, which is the stricter answer for a class-name sweep, and one tree draws
// none of them so the `empty:hidden` group is painted too.
const STUB_ACTIONS = Object.fromEntries(
  Object.keys(ADMIN_CONTROLS.content).map((name) => [name, vi.fn(() => Promise.resolve(SERVED))]),
) as unknown as PlanEditActions

const NOTHING_DRAWN = Object.fromEntries(
  Object.keys(ADMIN_CONTROLS.content).map((name) => [name, false]),
) as unknown as typeof ADMIN_CONTROLS.content

interface Panel {
  readonly key: string
  readonly row?: TableRow
  readonly values?: DrawerValues
  readonly description?: string | null
  readonly controls?: typeof ADMIN_CONTROLS.content
}

const panel = (over: Panel) => (
  <DrawerPanel
    actions={STUB_ACTIONS}
    closeHref="/plans/atlas"
    controls={over.controls ?? ADMIN_CONTROLS.content}
    description={over.description ?? null}
    key={over.key}
    planId={PLAN_A}
    row={over.row ?? DRAWER_ROW}
    values={over.values ?? { name: 'Auth rewrite', estimateDays: 5 }}
  />
)

// One subject resolved the way a drawer page resolves it, out of a plan that really carries three
// tokens: so the props the token sweep below reads are a reduction of the live fixture rather than
// strings written here, which is the only version of that check worth having.
const subjectOf = (kind: 'feature' | 'item', id: string) => {
  const found = drawerSubject(planScreenModel(atlasPlan()), kind, id)
  if (found === undefined) throw new Error(`the fixture no longer holds ${kind} ${id}`)
  return found
}

const ITEM = subjectOf('item', ITEM_1)

const CLIENT_FILES = [
  'components/plan/drawer/description-field.tsx',
  'components/plan/drawer/estimate-field.tsx',
  'components/plan/drawer/name-field.tsx',
] as const

const CLIENT_BY_FILE = new Map<unknown, string>([
  [DescriptionField, 'description-field.tsx'],
  [EstimateField, 'estimate-field.tsx'],
  [NameField, 'name-field.tsx'],
])

const PRIMITIVE = new Set(['string', 'number', 'boolean', 'function'])

interface HandedToClient {
  readonly file: string
  readonly props: Readonly<Record<string, unknown>>
}

// Server components are **called** rather than rendered, so the walk reaches the elements they build
// with the props still on them; the three client components are where it stops, those props being
// exactly what crosses into the browser.
const clientProps = (node: unknown): readonly HandedToClient[] => {
  if (Array.isArray(node)) return node.flatMap((one) => clientProps(one))
  if (!isValidElement<Record<string, unknown>>(node)) return []
  const file = CLIENT_BY_FILE.get(node.type)
  if (file !== undefined) return [{ file, props: node.props }]
  if (typeof node.type === 'function') {
    const build = node.type as (props: Record<string, unknown>) => unknown
    return clientProps(build(node.props))
  }
  return clientProps(node.props['children'])
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
    drawer={panel({ key: 'g1' })}
    key="g"
    plan={planScreenModel(atlasPlan())}
  />,
  panel({
    description: 'Ship behind a flag',
    key: 'h',
    row: { ...ITEM.row, treatment: 'hollow' },
    values: ITEM.values,
  }),
  panel({ controls: NOTHING_DRAWN, key: 'i' }),
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

  // This assertion used to be "no file under here declares use client", and the three fields of the
  // drawer are the first that must. It is an allowlist rather than a weakening: every other file under
  // the subtree is still asserted server-rendered, and the list is asserted **exact** in both
  // directions — a new client file fails until it is named here, and a name left behind by a file that
  // stopped being one fails too. So the sweep still reports every client component this subtree gains,
  // which is the thing it was really for.
  it('declares use client only in the three field files, and nowhere else under the plan', () => {
    const declared = walk(PLAN)
      .filter((file) => declaresUseClient(read(file)))
      .map((file) => relative(APP, file).split('\\').join('/'))
    expect([...declared].sort()).toEqual([...CLIENT_FILES].sort())
  })

  it('finds every allowlisted file on disk, so a renamed field cannot leave a name standing', () => {
    for (const file of CLIENT_FILES) {
      expect(declaresUseClient(read(join(APP, file))), file).toBe(true)
    }
  })

  // The assertion the old sweep implied and never had to state. A client component's props are
  // serialised into the Flight payload and land in the HTML, and the admin's own plan read carries every
  // live seat token — so what a client file may be handed is the question, and the answer here is
  // **primitives and functions only**. That rules out the plan, the reduced model, a `TableRow`, a
  // `PlanShareLink` and the whole actions object by shape rather than by name, which is what keeps it
  // from rotting: a prop added later is checked without this list being edited. The tree is expanded by
  // calling each server component, so what is inspected is what `DrawerPanel` really hands over rather
  // than what this file passed in.
  it('hands its client files nothing but primitives and functions, so no plan and no token can ride', () => {
    const handed = clientProps(panel({ description: 'Ship behind a flag', key: 'x', row: ITEM.row, values: ITEM.values }))
    expect(handed.map((one) => one.file).sort()).toEqual([
      'description-field.tsx',
      'estimate-field.tsx',
      'name-field.tsx',
    ])
    for (const { file, props } of handed) {
      for (const [name, value] of Object.entries(props)) {
        expect(PRIMITIVE.has(typeof value) || value === null, `${file}: ${name}`).toBe(true)
      }
    }
  })

  it('hands them no string holding a token, checked against the three the fixture really has', () => {
    const handed = clientProps(panel({ description: 'Ship behind a flag', key: 'x', row: ITEM.row, values: ITEM.values }))
    const strings = handed.flatMap(({ props }) =>
      Object.values(props).filter((value): value is string => typeof value === 'string'),
    )
    expect(strings.length).toBeGreaterThan(3)
    for (const token of atlasPlan().shareLinks.map((seat) => seat.token)) {
      expect(strings.filter((one) => one.includes(token))).toEqual([])
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
