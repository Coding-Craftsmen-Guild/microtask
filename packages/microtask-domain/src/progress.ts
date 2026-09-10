import { NO_PROGRESS, type Progress } from './entities/progress.js'
import type { Tab } from './entities/tab.js'
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

/**
 * Counts a whole task, since the manifest caches progress per task rather than per tab
 * (ADR 0007). A task with no tabs counts as nothing done out of nothing.
 */
export function countTabs(tabs: readonly Tab[]): Progress {
  let done = 0
  let total = 0
  for (const tab of tabs) {
    const counted = countTasks(tab.document)
    done += counted.done
    total += counted.total
  }
  return { done, total }
}

/**
 * Whether a cached count still matches what the document says.
 *
 * A cache that is absent never matches, so a hand-edited manifest missing one is recomputed on
 * read rather than read as zero (ADR 0007).
 */
export function agreesWith(cached: Progress | undefined, counted: Progress): boolean {
  return cached !== undefined && cached.done === counted.done && cached.total === counted.total
}
