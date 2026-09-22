import { Invalid } from '@repo/kernel'
import { LIMITS, type MicrotaskCountKey } from '@repo/contracts'

export {
  LIMITS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_DEPTH,
  type CountLimitKey,
  type LimitKey,
} from '@repo/contracts'

const LABEL: Readonly<Record<MicrotaskCountKey, string>> = {
  tabsPerTask: 'tabs in this task',
  tasksPerProject: 'tasks in this project',
  foldersPerProject: 'folders in this project',
  shareLinksPerProject: 'share links for this project',
  projectsPerProduct: 'projects',
}

/** Collapses whitespace, trims, and caps a display name. */
export function cleanName(value: unknown, fallback?: string): string {
  if (typeof value !== 'string') {
    if (fallback !== undefined) return fallback
    throw new Invalid('Name is required')
  }
  const collapsed = value.replace(/\s+/g, ' ').trim()
  const cleaned = [...collapsed].slice(0, LIMITS.nameLength).join('').trim()
  if (cleaned.length > 0) return cleaned
  if (fallback !== undefined) return fallback
  throw new Invalid('Name is required')
}

/**
 * Throws Invalid when adding one more would exceed a bound.
 *
 * Narrowed to Microtask's half of the count bounds, because no plan key can reach it: a
 * `*-domain` package may not import another (ADR 0014), so `macroplan-domain` re-implements this
 * over the same `@repo/contracts` constants rather than calling it. This function took
 * `CountLimitKey` while `LABEL` was typed at the wider `LimitKey`, which obliged the map to carry
 * seven entries no caller could ask for: six plan sentences, which that type permitted but nothing
 * could reach, every call site here passing a Microtask key and `macroplan-domain` unable to call
 * in at all; and a seventh for `nameLength`, which the key type never permitted, because it is not
 * a count — {@link cleanName} enforces it by truncating, and never throws.
 */
export function assertWithin(key: MicrotaskCountKey, current: number): void {
  if (current >= LIMITS[key]) {
    throw new Invalid(`Too many ${LABEL[key]} — the limit is ${LIMITS[key]}`)
  }
}
