import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as contracts from './index.js'
import { countTasks, emptyDocument, SAFE_HREF_SCHEMES } from './document-facts.js'
import { MAX_DOCUMENT_DEPTH } from './limits.js'

const PRODUCTION = new URL('../../../data/projects/01M240ERCRWWCN16Q5AHP1FZAQ.json', import.meta.url)

interface StoredTab {
  readonly name: string
  readonly document: unknown
}

const stored = (): readonly StoredTab[] =>
  (JSON.parse(readFileSync(PRODUCTION, 'utf8')) as { tabs: readonly StoredTab[] }).tabs

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
    const counted = stored().map((tab) => [tab.name, countTasks(tab.document)] as const)
    expect(counted).toEqual([
      ['Go-live', { done: 6, total: 6 }],
      ['General', { done: 6, total: 6 }],
      ['Content', { done: 0, total: 0 }],
      ['test', { done: 0, total: 0 }],
    ])
  })

  it('reads the real file rather than a fixture that happens to agree', () => {
    expect(stored().length).toBeGreaterThan(1)
    expect(readFileSync(PRODUCTION, 'utf8')).toContain('"taskItem"')
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
