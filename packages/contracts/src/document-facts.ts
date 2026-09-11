import type { z } from 'zod'
import type { DocumentJson } from './document.js'
import type { Progress } from './progress.js'
import { MAX_DOCUMENT_DEPTH } from './limits.js'

/** A Tiptap document as a caller holds it, which is what {@link emptyDocument} hands back. */
export type DocumentValue = z.infer<typeof DocumentJson>

/** Counted checklist state, which is what {@link countTasks} hands back. */
export type ProgressValue = z.infer<typeof Progress>

/** Link schemes a document may reference. What a link dialog may accept (ADR 0036). */
export const SAFE_HREF_SCHEMES = ['http', 'https', 'mailto', 'tel'] as const

/** Creates the document a new tab starts with, fresh each call so no two tabs share one. */
export const emptyDocument = (): DocumentValue => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})

const NOTHING: ProgressValue = { done: 0, total: 0 }

interface Frame {
  readonly node: unknown
  readonly depth: number
}

const isNode = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isChecked = (node: Record<string, unknown>): boolean => {
  const attrs = node['attrs']
  return isNode(attrs) && attrs['checked'] === true
}

/**
 * Counts `taskItem` nodes in a document. Never stored — always derived (ADR 0007).
 *
 * It walks `content` and nothing else, so a `marks` array naming a node type counts for nothing:
 * a mark is decoration on a node rather than a node, which is what keeps the `underline` mark
 * Tiptap 3 adds from arriving as an extra checklist item.
 *
 * Iterative rather than recursive, and bounded by {@link MAX_DOCUMENT_DEPTH}, because the input
 * is stored JSON: a hand-edited or imported document can nest as deeply as it likes and a
 * recursive walk would answer that with a stack overflow rather than a number.
 */
export function countTasks(document: unknown): ProgressValue {
  if (!isNode(document)) return NOTHING
  let done = 0
  let total = 0
  const stack: Frame[] = [{ node: document, depth: 0 }]
  while (stack.length > 0) {
    const frame = stack.pop()
    if (frame === undefined) break
    const { node, depth } = frame
    if (!isNode(node) || depth > MAX_DOCUMENT_DEPTH) continue
    if (node['type'] === 'taskItem') {
      total += 1
      if (isChecked(node)) done += 1
    }
    const content = node['content']
    if (!Array.isArray(content)) continue
    for (const child of content) stack.push({ node: child, depth: depth + 1 })
  }
  return { done, total }
}
