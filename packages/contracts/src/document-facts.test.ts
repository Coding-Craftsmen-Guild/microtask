import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as contracts from './index.js'
import { countTasks, emptyDocument, SAFE_HREF_SCHEMES } from './document-facts.js'
import { MAX_DOCUMENT_DEPTH } from './limits.js'

/**
 * The project the cutover runbook checks, and the fixture derived from it by
 * `scripts/derive-legacy-fixture.mjs`.
 *
 * `data/` is gitignored and holds production customer data, so a fresh clone, a CI runner and
 * every container build have no such file — and a suite that needs one cannot prove the image
 * builds (ADR 0026). The fixture carries, mechanically derived and asserted below against the
 * real file wherever that exists: the four tabs and their `position`; every node type and its
 * count (`doc`, `paragraph`, `text`, `taskList`, `taskItem`, `heading`); every `attrs`, so all
 * twelve `taskItem`s and the 12-of-12 `checked` distribution behind the measured per-tab numbers
 * survive; the absence of any `marks` array; and the nesting depth of five. That is everything
 * `countTasks` walks and everything `DocumentJson` parses, which is what makes it sufficient:
 * what it drops is the text, and `countTasks` never reads text.
 */
const FIXTURE = new URL('./testing/legacy-project.fixture.json', import.meta.url)
const PRODUCTION = new URL('../../../data/projects/01M240ERCRWWCN16Q5AHP1FZAQ.json', import.meta.url)
const hasProduction = existsSync(PRODUCTION)

const FILLER = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor '

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
    return { position, textNodes: texts.length, ...rest }
  })

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
        nodes: { doc: 1, paragraph: 7, text: 7, taskList: 1, taskItem: 6 },
        marks: [],
        depth: 5,
        items: 6,
        checked: 6,
      },
      {
        position: 1,
        textNodes: 7,
        nodes: { doc: 1, heading: 1, paragraph: 6, text: 7, taskList: 1, taskItem: 6 },
        marks: [],
        depth: 5,
        items: 6,
        checked: 6,
      },
      {
        position: 2,
        textNodes: 1,
        nodes: { doc: 1, paragraph: 1, text: 1 },
        marks: [],
        depth: 3,
        items: 0,
        checked: 0,
      },
      { position: 3, textNodes: 0, nodes: { doc: 1, paragraph: 1 }, marks: [], depth: 2, items: 0, checked: 0 },
    ])
  })

  it('carries no customer text: every text node and every tab name is filler', () => {
    for (const tab of fixture()) {
      expect(FILLER.startsWith(tab.name)).toBe(true)
      for (const text of facts(tab.document).texts) expect(FILLER.startsWith(text)).toBe(true)
    }
  })

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

  it.skipIf(!hasProduction)('derives that fixture from the real file: every structural fact agrees', () => {
    expect(structure(fixture())).toEqual(structure(tabsIn(PRODUCTION)))
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
