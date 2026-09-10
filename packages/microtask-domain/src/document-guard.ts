import { Invalid } from '@repo/kernel'
import { MAX_DOCUMENT_DEPTH } from './progress.js'
import type { DocumentJson } from './entities/document.js'

/** The largest a stored document may be, in JSON bytes. */
export const MAX_DOCUMENT_BYTES = 2_000_000

/** Link schemes a document may reference. */
export const SAFE_HREF_SCHEMES = ['http', 'https', 'mailto', 'tel'] as const

const BANNED_KEYS = ['__proto__', 'constructor', 'prototype'] as const

const SCHEME = /^([a-z][a-z0-9+.-]*):/i

const LAST_IGNORED_C0 = 0x20

const FIRST_IGNORED_C1 = 0x7f

const LAST_IGNORED_C1 = 0x9f

const isNode = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const jsonBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length

const ignoredByBrowsers = (char: string): boolean => {
  const code = char.charCodeAt(0)
  return code <= LAST_IGNORED_C0 || (code >= FIRST_IGNORED_C1 && code <= LAST_IGNORED_C1)
}

const asBrowsersSee = (value: string): string =>
  [...value].filter((char) => !ignoredByBrowsers(char)).join('')

function assertHref(value: unknown): void {
  if (typeof value !== 'string') return
  const matched = SCHEME.exec(asBrowsersSee(value))
  if (matched === null) return
  const scheme = (matched[1] ?? '').toLowerCase()
  if (!(SAFE_HREF_SCHEMES as readonly string[]).includes(scheme)) {
    throw new Invalid(`Link scheme "${scheme}" is not allowed`)
  }
}

function assertKeys(node: Record<string, unknown>): void {
  for (const key of BANNED_KEYS) {
    if (Object.hasOwn(node, key)) throw new Invalid(`Key "${key}" is not allowed in a document`)
  }
}

function assertNode(node: Record<string, unknown>): void {
  assertKeys(node)
  assertHref(node['href'])
  assertHref(node['src'])
}

function children(node: Record<string, unknown>): readonly unknown[] {
  const out: unknown[] = []
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) out.push(...value)
    else if (isNode(value)) out.push(value)
  }
  return out
}

function assertShape(document: unknown): asserts document is Record<string, unknown> {
  if (!isNode(document) || document['type'] !== 'doc') throw new Invalid('Not a document')
  const content = document['content']
  if (content !== undefined && !Array.isArray(content)) throw new Invalid('Invalid document content')
  if (jsonBytes(document) > MAX_DOCUMENT_BYTES) throw new Invalid('Document is too large')
}

function assertTree(root: Record<string, unknown>): void {
  const stack: { node: unknown; depth: number }[] = [{ node: root, depth: 0 }]
  while (stack.length > 0) {
    const frame = stack.pop()
    if (frame === undefined) break
    if (!isNode(frame.node)) continue
    if (frame.depth > MAX_DOCUMENT_DEPTH) throw new Invalid('Document is nested too deeply')
    assertNode(frame.node)
    for (const child of children(frame.node)) stack.push({ node: child, depth: frame.depth + 1 })
  }
}

/** Throws Invalid unless a document is safe to store and render (ADR 0019). */
export function assertSafeDocument(document: unknown): asserts document is DocumentJson {
  assertShape(document)
  assertTree(document)
}
