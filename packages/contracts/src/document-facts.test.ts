import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as contracts from './index.js'
import { countTasks, emptyDocument, SAFE_HREF_SCHEMES } from './document-facts.js'
import { MAX_DOCUMENT_DEPTH } from './limits.js'

/**
 * The two projects the cutover runbook checks, and the fixtures derived from them by
 * `scripts/derive-legacy-fixture.mjs`.
 *
 * `data/` is gitignored, so a fresh clone, a CI runner and every container build have no such
 * file — and a suite that needs one cannot prove the image builds (ADR 0026). What it holds
 * depends on the machine: locally a demo dataset in the legacy layout, on a deployment machine
 * the live volume. The guards below are written for the second case whichever it is, because
 * the fixtures are committed to a **public** repository.
 *
 * The fixtures carry, mechanically derived and asserted below against the real files wherever
 * those exist: the four tabs and their `position`; every node type and its
 * count (`doc`, `paragraph`, `text`, `taskList`, `taskItem`, `heading`); every `attrs`, so all
 * twelve `taskItem`s and the 12-of-12 `checked` distribution behind the measured per-tab numbers
 * survive; the absence of any `marks` array; the length of every text node, so no stored line
 * changes shape; and the nesting depth of five. That is everything `countTasks` walks and
 * everything `DocumentJson` parses, which is what makes it sufficient: what it drops is the text,
 * and `countTasks` never reads text.
 *
 * Two guards keep a re-derivation honest, because the derivation is the thing that could leak.
 *
 * {@link standsIn} runs over **every string in the fixture**, not over a list of keys thought
 * worth scrubbing, and that inversion is the point. Both this guard and the script it guards
 * once enumerated what to neutralise — `text`, `name`, `id`, `token`, the timestamps — and
 * returned everything else untouched, so the two agreed with each other while agreeing about
 * the wrong rule. Nothing leaked, because the projects it has run against hold no links, but
 * `marks[].attrs.href` is a client's URL under none of those keys and would have been copied
 * out verbatim. Now a string is a failure unless it is filler, a stamp, an id- or token-shaped
 * stand-in, a URL under the reserved `example.invalid` host, or one of the two structural enums
 * — and the enums are themselves checked rather than trusted, `permission` against its two
 * values and `type` against the shape of a node name. A schema that gains a free-text field
 * fails this guard instead of publishing it, and the guard needs no `data/`, so CI runs it too.
 *
 * Where `data/` is present the stronger form runs as well, and it is the one that would catch a
 * leak the rule above did not anticipate: not one stored string of three characters or more,
 * under any key at all, appears anywhere in either committed fixture.
 */
const FIXTURE = new URL('./testing/legacy-project.fixture.json', import.meta.url)
const FIXTURES = [FIXTURE, new URL('./testing/legacy-project-2.fixture.json', import.meta.url)] as const
const PRODUCTION = new URL('../../../data/projects/01M240ERCRWWCN16Q5AHP1FZAQ.json', import.meta.url)
const SOURCES = [
  PRODUCTION,
  new URL('../../../data/projects/01M240FB4GD6PF6V0PKZVF6FD9.json', import.meta.url),
] as const
const hasProduction = SOURCES.every((source) => existsSync(source))

const FILLER = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor '
const DASHED = FILLER.replaceAll(' ', '-')
const STAMP = '2026-01-01T00:00:00.000Z'
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RESERVED_HOST = 'https://example.invalid/'
const PRESERVED = new Set(['type', 'permission'])
const STAMPED = new Set(['createdAt', 'updatedAt'])
const URL_KEYED = new Set(['href', 'src'])
const PERMISSIONS = new Set(['read', 'write'])
const NODE_NAME = /^[A-Za-z]+$/
const SHORTEST_LEAK = 3
const LEAKABLE_STRINGS = 20

interface StoredTab {
  readonly name: string
  readonly position: number
  readonly document: unknown
}

interface Facts {
  nodes: Record<string, number>
  marks: string[]
  depth: number
  items: number
  checked: number
  texts: string[]
}

const tabsIn = (source: URL): readonly StoredTab[] =>
  (JSON.parse(readFileSync(source, 'utf8')) as { tabs: readonly StoredTab[] }).tabs

const fixture = (): readonly StoredTab[] => tabsIn(FIXTURE)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object'

const childrenOf = (record: Record<string, unknown>, key: string): readonly unknown[] =>
  Array.isArray(record[key]) ? (record[key] as readonly unknown[]) : []

function tally(node: Record<string, unknown>, type: string, into: Facts): void {
  into.nodes[type] = (into.nodes[type] ?? 0) + 1
  if (type === 'text') into.texts.push(String(node['text']))
  if (type !== 'taskItem') return
  into.items += 1
  const attrs = node['attrs']
  if (isRecord(attrs) && attrs['checked'] === true) into.checked += 1
}

function gather(node: unknown, depth: number, into: Facts): Facts {
  if (!isRecord(node)) return into
  const type = node['type']
  if (typeof type === 'string') {
    into.depth = Math.max(into.depth, depth)
    tally(node, type, into)
  }
  for (const mark of childrenOf(node, 'marks')) {
    if (isRecord(mark) && typeof mark['type'] === 'string') into.marks.push(mark['type'])
  }
  for (const child of childrenOf(node, 'content')) gather(child, depth + 1, into)
  return into
}

const facts = (document: unknown): Facts =>
  gather(document, 1, { nodes: {}, marks: [], depth: 0, items: 0, checked: 0, texts: [] })

const structure = (tabs: readonly StoredTab[]): readonly unknown[] =>
  tabs.map(({ position, document }) => {
    const { texts, ...rest } = facts(document)
    return { position, textNodes: texts.length, textLengths: texts.map((text) => text.length), ...rest }
  })

type Keyed = readonly [string, string]

function keyedStrings(node: unknown, key: string, into: Keyed[]): readonly Keyed[] {
  if (Array.isArray(node)) {
    for (const child of node) keyedStrings(child, key, into)
    return into
  }
  if (isRecord(node)) {
    for (const [own, value] of Object.entries(node)) keyedStrings(value, own, into)
    return into
  }
  if (typeof node === 'string') into.push([key, node])
  return into
}

const everyKeyedString = (source: URL): readonly Keyed[] =>
  keyedStrings(JSON.parse(readFileSync(source, 'utf8')), '', [])

function standsIn([key, value]: Keyed): boolean {
  if (PRESERVED.has(key)) {
    return key === 'permission' ? PERMISSIONS.has(value) : NODE_NAME.test(value)
  }
  if (STAMPED.has(key)) return value === STAMP
  if (value === '') return true
  const mark = CROCKFORD.includes(value.slice(-1))
  if (key === 'id') return mark && /^0+.$/.test(value)
  if (key === 'token') return mark && DASHED.startsWith(value.slice(0, -1))
  if (URL_KEYED.has(key)) return value.startsWith(RESERVED_HOST)
  return FILLER.startsWith(value)
}

const doc = (...content: readonly unknown[]): unknown => ({ type: 'doc', content })

const item = (checked: boolean): unknown => ({ type: 'taskItem', attrs: { checked } })

const nest = (depth: number, leaf: unknown): unknown =>
  depth === 0 ? leaf : { type: 'taskList', content: [nest(depth - 1, leaf)] }

describe('emptyDocument', () => {
  it('is what a new tab starts as, and parses as a document', () => {
    expect(emptyDocument()).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(contracts.DocumentJson.safeParse(emptyDocument()).success).toBe(true)
  })

  it('hands back a fresh object each time, so one tab cannot reach another', () => {
    expect(emptyDocument()).not.toBe(emptyDocument())
  })
})

describe('SAFE_HREF_SCHEMES', () => {
  it('is the closed set a link dialog may accept', () => {
    expect([...SAFE_HREF_SCHEMES]).toEqual(['http', 'https', 'mailto', 'tel'])
  })
})

describe('countTasks against the documents production actually holds', () => {
  it('counts each stored tab the way the app being replaced counted it', () => {
    const counted = fixture().map((tab) => [tab.position, countTasks(tab.document)] as const)
    expect(counted).toEqual([
      [0, { done: 6, total: 6 }],
      [1, { done: 6, total: 6 }],
      [2, { done: 0, total: 0 }],
      [3, { done: 0, total: 0 }],
    ])
  })

  it('reads four stored tabs, every one of them valid input to Tiptap 3', () => {
    expect(fixture()).toHaveLength(4)
    for (const tab of fixture()) {
      expect(contracts.DocumentJson.safeParse(tab.document).success).toBe(true)
    }
  })

  it('reads documents carrying the node types, depth and checked distribution production stores', () => {
    expect(structure(fixture())).toEqual([
      {
        position: 0,
        textNodes: 7,
        textLengths: [17, 16, 3, 3, 8, 15, 7],
        nodes: { doc: 1, paragraph: 7, text: 7, taskList: 1, taskItem: 6 },
        marks: [],
        depth: 5,
        items: 6,
        checked: 6,
      },
      {
        position: 1,
        textNodes: 7,
        textLengths: [17, 16, 3, 3, 8, 15, 7],
        nodes: { doc: 1, heading: 1, paragraph: 6, text: 7, taskList: 1, taskItem: 6 },
        marks: [],
        depth: 5,
        items: 6,
        checked: 6,
      },
      {
        position: 2,
        textNodes: 1,
        textLengths: [4],
        nodes: { doc: 1, paragraph: 1, text: 1 },
        marks: [],
        depth: 3,
        items: 0,
        checked: 0,
      },
      {
        position: 3,
        textNodes: 0,
        textLengths: [],
        nodes: { doc: 1, paragraph: 1 },
        marks: [],
        depth: 2,
        items: 0,
        checked: 0,
      },
    ])
  })

  it('carries no customer text: every text node and every tab name is filler', () => {
    for (const tab of fixture()) {
      expect(FILLER.startsWith(tab.name)).toBe(true)
      for (const text of facts(tab.document).texts) expect(FILLER.startsWith(text)).toBe(true)
    }
  })

  it.each([0, 1])(
    'fixture %i stands in for EVERY string it carries, so a new free-text key fails closed',
    (which) => {
      const found = everyKeyedString(FIXTURES[which] as URL)
      expect(found.length).toBeGreaterThan(0)
      expect(found.filter((pair) => !standsIn(pair))).toEqual([])
    },
  )

  it.each([
    ['href', 'https://acme.example.com/brief?client=jane', 'a link mark carrying a client URL'],
    ['src', 'https://acme.example.com/logo.png', 'an image source'],
    ['caption', 'Jane at ACME signed this off', 'a free-text key no schema has yet'],
    ['title', 'ACME Q3 rollout', 'the link title Tiptap 3 added'],
  ])(
    'rejects %s copied verbatim — %s — which the old key-list rule would have published',
    (key, value) => {
      expect(standsIn([key, value])).toBe(false)
    },
  )

  it('accepts the stand-ins the script does produce for those same keys', () => {
    expect(standsIn(['href', `${RESERVED_HOST}lorem-ipsum-A`])).toBe(true)
    expect(standsIn(['caption', FILLER.slice(0, 12)])).toBe(true)
    expect(standsIn(['type', 'taskItem'])).toBe(true)
    expect(standsIn(['permission', 'write'])).toBe(true)
    expect(standsIn(['permission', 'ACME internal'])).toBe(false)
    expect(standsIn(['type', 'Jane at ACME'])).toBe(false)
  })

  it.skipIf(!hasProduction)(
    'leaks not one stored string of three characters into either fixture, whatever its key',
    () => {
      const committed = FIXTURES.map((source) => readFileSync(source, 'utf8')).join('\n')
      const stored = SOURCES.flatMap((source) => [...everyKeyedString(source)]).filter(
        ([key, value]) => !PRESERVED.has(key) && value.length >= SHORTEST_LEAK,
      )
      expect(stored.length).toBeGreaterThan(LEAKABLE_STRINGS)
      expect(stored.filter(([, value]) => committed.includes(value))).toEqual([])
    },
  )

  it.skipIf(!hasProduction)('counts the real file the same, on a machine that holds data/', () => {
    const counted = tabsIn(PRODUCTION).map((tab) => [tab.name, countTasks(tab.document)] as const)
    expect(counted).toEqual([
      ['Go-live', { done: 6, total: 6 }],
      ['General', { done: 6, total: 6 }],
      ['Content', { done: 0, total: 0 }],
      ['test', { done: 0, total: 0 }],
    ])
    expect(readFileSync(PRODUCTION, 'utf8')).toContain('"taskItem"')
  })

  it.skipIf(!hasProduction)('derives each fixture from its real file: every structural fact agrees', () => {
    for (const [index, source] of SOURCES.entries()) {
      expect(structure(tabsIn(FIXTURES[index] as URL))).toEqual(structure(tabsIn(source)))
    }
  })
})

describe('countTasks against the marks Tiptap 3 adds that v2 had no concept of', () => {
  const underlined = (checked: boolean): unknown => ({
    type: 'taskItem',
    attrs: { checked },
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'underline' }], text: 'Sign the contract' }],
      },
    ],
  })

  it('counts an underlined item exactly once, marks being decoration and not structure', () => {
    expect(countTasks(doc(underlined(true), underlined(false)))).toEqual({ done: 1, total: 2 })
  })

  it('never mistakes a mark for a node, however a mark is spelled', () => {
    const marked = { type: 'paragraph', marks: [{ type: 'taskItem' }, { type: 'underline' }] }
    expect(countTasks(doc(marked))).toEqual({ done: 0, total: 0 })
  })
})

describe('countTasks at its edges', () => {
  it('counts nothing in something that is not a node', () => {
    expect(countTasks('nope')).toEqual({ done: 0, total: 0 })
    expect(countTasks(null)).toEqual({ done: 0, total: 0 })
  })

  it('treats a checked attribute that is not true as unchecked', () => {
    expect(countTasks(doc({ type: 'taskItem', attrs: { checked: 'yes' } }))).toEqual({ done: 0, total: 1 })
  })

  it('stops descending past MAX_DOCUMENT_DEPTH rather than overflowing the stack', () => {
    expect(countTasks(doc(nest(MAX_DOCUMENT_DEPTH - 2, item(true))))).toEqual({ done: 1, total: 1 })
    expect(countTasks(doc(nest(MAX_DOCUMENT_DEPTH + 5, item(true))))).toEqual({ done: 0, total: 0 })
  })

  it('counts an item sitting at exactly MAX_DOCUMENT_DEPTH, and none one step past it', () => {
    const at = (depth: number): unknown => doc(nest(depth - 1, item(true)))
    expect(countTasks(at(MAX_DOCUMENT_DEPTH))).toEqual({ done: 1, total: 1 })
    expect(countTasks(at(MAX_DOCUMENT_DEPTH + 1))).toEqual({ done: 0, total: 0 })
  })

  it('descends far enough to count a document no browser would ever produce, without throwing', () => {
    expect(() => countTasks(doc(nest(MAX_DOCUMENT_DEPTH * 40, item(true))))).not.toThrow()
  })

  it('is reachable from the barrel', () => {
    expect(contracts.countTasks).toBe(countTasks)
    expect(contracts.emptyDocument).toBe(emptyDocument)
    expect(contracts.SAFE_HREF_SCHEMES).toBe(SAFE_HREF_SCHEMES)
  })
})
