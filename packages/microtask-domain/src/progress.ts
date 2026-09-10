import { NO_PROGRESS, type Progress } from './entities/progress.js'
import { MAX_DOCUMENT_DEPTH } from './limits.js'

export { MAX_DOCUMENT_DEPTH } from './limits.js'

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

/** Counts taskItem nodes in a document. Never stored — always derived (ADR 0007). */
export function countTasks(document: unknown): Progress {
  if (!isNode(document)) return NO_PROGRESS
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
